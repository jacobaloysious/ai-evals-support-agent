import assert from "node:assert/strict";
import test from "node:test";
import { createSupportAgent } from "../src/agent.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import {
  createAgentRefundTools,
  createHumanRefundTools,
  RefundRequestStore,
} from "../src/refund_requests.js";

const address = {
  recipientName: "Alice",
  line1: "1 Old Street",
  city: "New Delhi",
  state: "Delhi",
  pin: "110001",
  country: "IN",
};
const order = {
  id: "order-100",
  customerId: "alice",
  createdAt: "2026-10-01T00:00:00Z",
  status: "packed",
  active: true,
  shippedAt: null,
  deliveryAddress: address,
  promisedDeliveryAt: "2026-10-12T00:00:00Z",
  shippingFee: 50,
  carrierLost: false,
};
const pinDirectory = new Map([["110001", { assigned: true, state: "Delhi", serviceable: true }]]);
const alice = { authenticated: true, userId: "alice", email: "alice@example.com" };

function fixture({ session = alice, orders = [order], now = "2026-10-11T00:00:00Z", confirmed = () => false } = {}) {
  const store = new OrderStore(orders);
  const requests = new RefundRequestStore();
  const orderTools = createOrderTools({
    store,
    getSession: () => session,
    pinDirectory,
    quoteDeliveryPromise: () => "2026-10-15T00:00:00Z",
    consumeAddressConfirmation: confirmed,
  });
  const refundTools = createAgentRefundTools({
    orders: store,
    requests,
    getSession: () => session,
    getNow: () => now,
  });
  return {
    agent: createSupportAgent({ orderTools, refundTools }),
    store,
    requests,
    refundTools,
  };
}

test("model-supplied identity cannot read another customer's order", () => {
  const { agent } = fixture({ session: { authenticated: true, userId: "bob" } });
  const result = agent.handleProposal({
    action: "get_order", args: { orderId: order.id, customerId: "alice" },
  });
  assert.equal(result.outcome, "declined");
  assert.match(result.message, /account you're signed into/);
  assert.doesNotMatch(result.message, /1 Old Street|packed/);
});

test("missing-order recovery shows only the current session's orders", () => {
  const { agent } = fixture({ orders: [order, { ...order, id: "order-200", customerId: "bob" }] });
  const result = agent.handleProposal({ action: "list_my_orders", args: { customerId: "bob" } });
  assert.match(result.message, /a\*\*\*@example.com/);
  assert.match(result.message, /order-100/);
  assert.doesNotMatch(result.message, /order-200|1 Old Street/);
});

test("agent asks for confirmation and preserves the address on state/PIN mismatch", () => {
  const { agent, store } = fixture();
  const result = agent.handleProposal({
    action: "change_address",
    args: { orderId: order.id, newAddress: { ...address, state: "Karnataka" } },
  });
  assert.equal(result.outcome, "needs_confirmation");
  assert.match(result.message, /PIN 110001 is listed for Delhi/);
  assert.match(result.message, /confirm the correct details/);
  assert.deepEqual(store.getOrderForOwner(order.id, "alice").deliveryAddress, address);
  const prematureRetry = agent.handleProposal({
    action: "change_address",
    args: { orderId: order.id, newAddress: { ...address, line1: "2 New Street" } },
  });
  assert.equal(prematureRetry.outcome, "needs_confirmation");
  assert.deepEqual(store.getOrderForOwner(order.id, "alice").deliveryAddress, address);
});

test("trusted customer confirmation unlocks a corrected address", () => {
  let confirmed = false;
  const { agent, store } = fixture({ confirmed: () => confirmed });
  agent.handleProposal({
    action: "change_address",
    args: { orderId: order.id, newAddress: { ...address, state: "Karnataka" } },
  });
  confirmed = true; // Represents a server-recorded customer confirmation, never model text.
  const result = agent.handleProposal({
    action: "change_address",
    args: { orderId: order.id, newAddress: { ...address, line1: "2 New Street" } },
  });
  assert.equal(result.outcome, "changed");
  assert.equal(store.getOrderForOwner(order.id, "alice").deliveryAddress.line1, "2 New Street");
});

test("agent changes an owned unshipped order with a revised delivery promise", () => {
  const { agent, store } = fixture();
  const result = agent.handleProposal({
    action: "change_address",
    args: { orderId: order.id, newAddress: { ...address, line1: "2 New Street" } },
  });
  assert.equal(result.outcome, "changed");
  assert.equal(store.getOrderForOwner(order.id, "alice").promisedDeliveryAt, "2026-10-15T00:00:00Z");
});

test("agent declines an address change after shipment", () => {
  const { agent, store } = fixture({ orders: [{ ...order, status: "shipped", shippedAt: "2026-10-10T00:00:00Z" }] });
  const result = agent.handleProposal({
    action: "change_address",
    args: { orderId: order.id, newAddress: { ...address, line1: "2 New Street" } },
  });
  assert.equal(result.outcome, "declined");
  assert.deepEqual(store.getOrderForOwner(order.id, "alice").deliveryAddress, address);
});

test("policy-inapplicable refund is declined without a review request", () => {
  const { agent, requests } = fixture();
  const result = agent.handleProposal({ action: "request_shipping_refund", args: { orderId: order.id } });
  assert.equal(result.outcome, "declined");
  assert.match(result.message, /policy does not apply/);
  assert.equal(requests.get("refund-1"), null);
});

test("refund tool cannot use a model-supplied customer ID or unauthenticated session", () => {
  const otherSession = fixture({
    session: { authenticated: true, userId: "bob" },
    now: "2026-10-13T00:00:00Z",
  });
  assert.equal(otherSession.agent.handleProposal({
    action: "request_shipping_refund",
    args: { orderId: order.id, customerId: "alice" },
  }).outcome, "declined");
  assert.equal(otherSession.requests.get("refund-1"), null);

  const signedOut = fixture({ session: null, now: "2026-10-13T00:00:00Z" });
  assert.equal(signedOut.agent.handleProposal({
    action: "request_shipping_refund", args: { orderId: order.id },
  }).outcome, "declined");
  assert.equal(signedOut.requests.get("refund-1"), null);
});

test("eligible refund creates only a pending human review request", () => {
  const { agent, requests } = fixture({ now: "2026-10-13T00:00:00Z" });
  const result = agent.handleProposal({ action: "request_shipping_refund", args: { orderId: order.id } });
  assert.equal(result.outcome, "pending_human_review");
  assert.deepEqual(requests.get("refund-1"), {
    id: "refund-1",
    orderId: order.id,
    customerId: "alice",
    reason: "",
    policyCode: "DELIVERY_LATE",
    maxAmount: 50,
    status: "pending",
  });
  assert.equal(typeof agent.handleProposal({ action: "approve_refund", args: { requestId: "refund-1" } }).message, "string");
  assert.equal(requests.get("refund-1").status, "pending");
});

test("human-only review enforces reviewer session and shipping-fee cap", () => {
  const { refundTools, requests } = fixture({ now: "2026-10-13T00:00:00Z" });
  const pending = refundTools.requestShippingRefund({ orderId: order.id });
  const customerReview = createHumanRefundTools({
    requests,
    getReviewerSession: () => alice,
    getNow: () => "2026-10-13T01:00:00Z",
  });
  assert.deepEqual(customerReview.decideRefund({ requestId: pending.requestId, approved: true, amount: 50 }), {
    ok: false, code: "REVIEWER_REQUIRED",
  });
  const humanReview = createHumanRefundTools({
    requests,
    getReviewerSession: () => ({ authenticated: true, userId: "reviewer-1", role: "refund_reviewer" }),
    getNow: () => "2026-10-13T01:00:00Z",
  });
  assert.deepEqual(humanReview.decideRefund({ requestId: pending.requestId, approved: true, amount: 51 }), {
    ok: false, code: "AMOUNT_EXCEEDS_SHIPPING_FEE",
  });
  assert.deepEqual(humanReview.decideRefund({ requestId: pending.requestId, approved: false, amount: 1 }), {
    ok: false, code: "INVALID_AMOUNT",
  });
  assert.deepEqual(humanReview.decideRefund({ requestId: pending.requestId, approved: true, amount: 50 }), {
    ok: true, requestId: pending.requestId, status: "approved",
  });
  assert.equal(requests.get(pending.requestId).reviewerId, "reviewer-1");
  assert.equal(requests.get(pending.requestId).decidedAt, "2026-10-13T01:00:00Z");
});
