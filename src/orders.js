import { validateIndiaAddress } from "./address.js";

/** Fictional synchronous store. A real database needs a conditional update. */
export class OrderStore {
  #orders;

  constructor(orders = []) {
    this.#orders = new Map(orders.map((order) => [order.id, { ...order }]));
  }

  getOrderForOwner(orderId, customerId) {
    const order = this.#orders.get(orderId);
    if (!order || order.customerId !== customerId) return null;
    return { ...order };
  }

  listOrdersForOwner(customerId) {
    return [...this.#orders.values()]
      .filter((order) => order.customerId === customerId)
      .map((order) => ({ ...order }));
  }

  /** Recheck current ownership and shipping state in the same operation as the save. */
  changeAddressForOwner(orderId, customerId, newAddress, newPromise) {
    const order = this.#orders.get(orderId);
    if (!order || order.customerId !== customerId) {
      return { ok: false, code: "ORDER_NOT_ACCESSIBLE" };
    }
    if (!order.active) return { ok: false, code: "ORDER_INACTIVE" };
    if (order.shippedAt !== null) {
      return { ok: false, code: "ALREADY_SHIPPED" };
    }

    order.deliveryAddress = { ...newAddress };
    order.promisedDeliveryAt = newPromise;
    return {
      ok: true,
      code: "ADDRESS_CHANGED",
      orderId,
      deliveryAddress: { ...order.deliveryAddress },
      promisedDeliveryAt: newPromise,
    };
  }

  /** Simulates a separate warehouse process changing an order after a read. */
  markShipped(orderId, timestamp) {
    const order = this.#orders.get(orderId);
    if (!order) throw new Error("Unknown order");
    order.shippedAt = timestamp;
  }
}

function signedInUser(getSession) {
  const session = getSession();
  return session?.authenticated === true && session.userId ? session : null;
}

function maskedEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return null;
  const [name, domain] = email.split("@");
  if (!name || !domain) return null;
  return `${name[0]}***@${domain}`;
}

/**
 * The trusted server injects session, PIN directory, and fulfillment promise.
 * The model can supply only request details, never its own customer identity.
 */
export function createOrderTools({ store, getSession, pinDirectory, quoteDeliveryPromise }) {
  if (!(store instanceof OrderStore) || typeof getSession !== "function") {
    throw new TypeError("A store and trusted session provider are required");
  }
  if (!(pinDirectory instanceof Map) || typeof quoteDeliveryPromise !== "function") {
    throw new TypeError("Trusted PIN and delivery promise providers are required");
  }

  return {
    getOrder({ orderId }) {
      const session = signedInUser(getSession);
      if (!session) return { ok: false, code: "AUTH_REQUIRED" };
      const order = store.getOrderForOwner(orderId, session.userId);
      if (!order) return { ok: false, code: "ORDER_NOT_ACCESSIBLE" };
      return {
        ok: true,
        code: "ORDER_FOUND",
        order: {
          id: order.id,
          status: order.status,
          shippedAt: order.shippedAt,
          deliveryAddress: { ...order.deliveryAddress },
          promisedDeliveryAt: order.promisedDeliveryAt,
        },
      };
    },

    listMyOrders() {
      const session = signedInUser(getSession);
      if (!session) return { ok: false, code: "AUTH_REQUIRED" };
      const orders = store.listOrdersForOwner(session.userId)
        .sort((a, b) => {
          const aShipped = a.shippedAt === null ? 0 : 1;
          const bShipped = b.shippedAt === null ? 0 : 1;
          return aShipped - bShipped || b.createdAt.localeCompare(a.createdAt);
        })
        .slice(0, 10)
        .map(({ id, createdAt, status }) => ({ id, createdAt, status }));
      return {
        ok: true,
        code: "ORDERS_FOUND",
        account: maskedEmail(session.email),
        orders,
      };
    },

    changeAddress({ orderId, newAddress }) {
      const session = signedInUser(getSession);
      if (!session) return { ok: false, code: "AUTH_REQUIRED" };
      const order = store.getOrderForOwner(orderId, session.userId);
      if (!order) return { ok: false, code: "ORDER_NOT_ACCESSIBLE" };
      const checked = validateIndiaAddress(newAddress, pinDirectory);
      if (!checked.ok) return checked;
      const newPromise = quoteDeliveryPromise(order, checked.address);
      if (typeof newPromise !== "string" || Number.isNaN(Date.parse(newPromise))) {
        return { ok: false, code: "PROMISE_UNAVAILABLE" };
      }
      return store.changeAddressForOwner(
        orderId,
        session.userId,
        checked.address,
        newPromise,
      );
    },
  };
}

/** Keep internal denial codes separate from safe customer-facing wording. */
export function orderLookupMessage(result) {
  if (result.code === "ORDER_NOT_ACCESSIBLE") {
    return "I can't find that order under the account you're signed into. Please check the order number or sign into the account used for the purchase.";
  }
  if (result.code === "AUTH_REQUIRED") {
    return "Please sign in to the account used for the purchase so I can look up your order.";
  }
  return null;
}

export function orderRecoveryMessage(result) {
  if (result.code === "AUTH_REQUIRED") return orderLookupMessage(result);
  if (result.code !== "ORDERS_FOUND") return null;
  const account = result.account ?? "your current account";
  const lines = result.orders.map(({ id, createdAt, status }) =>
    `- ${id} · ${createdAt.slice(0, 10)} · ${status}`,
  );
  return [
    `You're signed in as ${account}. Here are your recent orders, with unshipped ones first:`,
    ...lines,
    "If the order is not here, please sign in to another account you may have used for the purchase or contact support.",
  ].join("\n");
}

export function addressChangeMessage(result) {
  if (result.code === "STATE_PIN_MISMATCH") {
    return `I couldn't change the address because PIN ${result.pin} is listed for ${result.postalState}, while the address you entered says ${result.submittedState}. Please check the state and PIN, then confirm the correct details before I update your order.`;
  }
  return null;
}
