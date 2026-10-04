import { OrderStore } from "./orders.js";
import { shippingFeeReviewEligibility } from "./refunds.js";

/** In-memory course fixture. A production queue needs durable storage and audit logs. */
export class RefundRequestStore {
  #requests = new Map();
  #nextId = 1;

  constructor(requests = []) {
    for (const request of requests) {
      this.#requests.set(request.id, { ...request });
      const numericId = Number(request.id.match(/^refund-(\d+)$/)?.[1]);
      if (Number.isInteger(numericId)) this.#nextId = Math.max(this.#nextId, numericId + 1);
    }
  }

  create({ orderId, customerId, reason, policyCode, maxAmount }) {
    const request = {
      id: `refund-${this.#nextId++}`,
      orderId,
      customerId,
      reason,
      policyCode,
      maxAmount,
      status: "pending",
    };
    this.#requests.set(request.id, request);
    return { ...request };
  }

  get(id) {
    const request = this.#requests.get(id);
    return request ? { ...request } : null;
  }

  listForCustomer(customerId) {
    return [...this.#requests.values()]
      .filter((request) => request.customerId === customerId)
      .map((request) => ({ ...request }));
  }

  /** Records a review decision; no payment or refund is issued here. */
  decide(id, reviewerId, approved, amount, decidedAt) {
    const request = this.#requests.get(id);
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" };
    if (request.status !== "pending") return { ok: false, code: "ALREADY_REVIEWED" };
    if (approved && amount > request.maxAmount) return { ok: false, code: "AMOUNT_EXCEEDS_SHIPPING_FEE" };
    request.status = approved ? "approved" : "rejected";
    request.reviewerId = reviewerId;
    request.amount = amount;
    request.decidedAt = decidedAt;
    return { ok: true, requestId: id, status: request.status };
  }
}

/** This is the only refund capability made available to the customer agent. */
export function createAgentRefundTools({ orders, requests, getSession, getNow }) {
  if (!(orders instanceof OrderStore) || !(requests instanceof RefundRequestStore)
    || typeof getSession !== "function" || typeof getNow !== "function") {
    throw new TypeError("Trusted order, request, session, and clock providers are required");
  }

  return {
    requestShippingRefund({ orderId, reason }) {
      const session = getSession();
      if (session?.authenticated !== true || !session.userId) {
        return { ok: false, code: "AUTH_REQUIRED" };
      }
      const order = orders.getOrderForOwner(orderId, session.userId);
      if (!order) return { ok: false, code: "ORDER_NOT_ACCESSIBLE" };

      const eligibility = shippingFeeReviewEligibility(order, getNow());
      if (eligibility.eligible === false) {
        return { ok: false, code: "REFUND_NOT_ELIGIBLE", policyCode: eligibility.code };
      }
      if (eligibility.eligible === null) {
        return { ok: false, code: "REVIEW_NEEDED", policyCode: eligibility.code };
      }
      if (!Number.isFinite(order.shippingFee) || order.shippingFee <= 0) {
        return { ok: false, code: "REVIEW_NEEDED", policyCode: "SHIPPING_FEE_UNAVAILABLE" };
      }
      const request = requests.create({
        orderId,
        customerId: session.userId,
        reason: typeof reason === "string" ? reason.slice(0, 500) : "",
        policyCode: eligibility.code,
        maxAmount: order.shippingFee,
      });
      return { ok: true, code: "REVIEW_REQUESTED", requestId: request.id, status: "pending" };
    },
  };
}

/** Separate human-only capability, never passed to the customer agent. */
export function createHumanRefundTools({ requests, getReviewerSession, getNow }) {
  if (!(requests instanceof RefundRequestStore) || typeof getReviewerSession !== "function"
    || typeof getNow !== "function") {
    throw new TypeError("A request store, trusted reviewer session, and clock are required");
  }
  return {
    decideRefund({ requestId, approved, amount = 0 }) {
      const session = getReviewerSession();
      if (session?.authenticated !== true || session.role !== "refund_reviewer" || !session.userId) {
        return { ok: false, code: "REVIEWER_REQUIRED" };
      }
      if (typeof approved !== "boolean") return { ok: false, code: "INVALID_DECISION" };
      if (!Number.isFinite(amount) || amount < 0 || (approved && amount === 0)
        || (!approved && amount !== 0)) {
        return { ok: false, code: "INVALID_AMOUNT" };
      }
      return requests.decide(requestId, session.userId, approved, amount, getNow());
    },
  };
}
