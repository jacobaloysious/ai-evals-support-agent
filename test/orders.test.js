import assert from "node:assert/strict";
import test from "node:test";
import { createOrderTools, OrderStore, orderLookupMessage } from "../src/orders.js";

const original = {
  id: "order-100",
  customerId: "alice",
  status: "packed",
  active: true,
  shippedAt: null,
  deliveryAddress: "1 Old Street",
};

function fixture(session) {
  const store = new OrderStore([original]);
  const tools = createOrderTools({ store, getSession: () => session });
  return { store, tools };
}

test("lets the authenticated owner read permitted order details", () => {
  const { tools } = fixture({ authenticated: true, userId: "alice" });
  assert.deepEqual(tools.getOrder({ orderId: original.id }), {
    ok: true,
    code: "ORDER_FOUND",
    order: {
      id: original.id,
      status: "packed",
      shippedAt: null,
      deliveryAddress: "1 Old Street",
    },
  });
});

test("does not reveal someone else's order or address", () => {
  const { tools } = fixture({ authenticated: true, userId: "bob" });
  assert.deepEqual(tools.getOrder({
    orderId: original.id,
    customerId: "alice", // A model-supplied identity cannot override Bob's session.
  }), { ok: false, code: "ORDER_NOT_ACCESSIBLE" });
});

test("does not reveal an order without authentication", () => {
  const { tools } = fixture(null);
  assert.deepEqual(tools.getOrder({ orderId: original.id }), {
    ok: false,
    code: "AUTH_REQUIRED",
  });
});

test("missing and other-owned orders get the same useful customer response", () => {
  const { tools } = fixture({ authenticated: true, userId: "bob" });
  const otherOwned = tools.getOrder({ orderId: original.id });
  const missing = tools.getOrder({ orderId: "missing-order" });
  assert.deepEqual(otherOwned, missing);
  assert.equal(
    orderLookupMessage(otherOwned),
    "I can't find that order under the account you're signed into. Please check the order number or sign into the account used for the purchase.",
  );
  assert.equal(orderLookupMessage(missing), orderLookupMessage(otherOwned));
});

test("rejects an unauthenticated request without changing the order", () => {
  const { store, tools } = fixture(null);
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: "2 New Street",
  }), { ok: false, code: "AUTH_REQUIRED" });
  assert.equal(store.getOrderForOwner(original.id, "alice").deliveryAddress, "1 Old Street");
});

test("does not let a signed-in customer change someone else's order", () => {
  const { store, tools } = fixture({ authenticated: true, userId: "bob" });
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: "2 New Street",
    customerId: "alice", // Untrusted model input must not override Bob's session.
  }), { ok: false, code: "ORDER_NOT_ACCESSIBLE" });
  assert.equal(store.getOrderForOwner(original.id, "alice").deliveryAddress, "1 Old Street");
});

test("allows the authenticated owner to change a packed but unshipped order", () => {
  const { store, tools } = fixture({ authenticated: true, userId: "alice" });
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: " 2 New Street ",
  }), {
    ok: true,
    code: "ADDRESS_CHANGED",
    orderId: original.id,
    deliveryAddress: "2 New Street",
  });
  assert.equal(store.getOrderForOwner(original.id, "alice").deliveryAddress, "2 New Street");
});

test("rechecks shipping state when saving after an earlier unshipped read", () => {
  const { store, tools } = fixture({ authenticated: true, userId: "alice" });
  assert.equal(store.getOrderForOwner(original.id, "alice").shippedAt, null);
  store.markShipped(original.id, "2026-10-04T00:00:00Z");
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: "2 New Street",
  }), { ok: false, code: "ALREADY_SHIPPED" });
  assert.equal(store.getOrderForOwner(original.id, "alice").deliveryAddress, "1 Old Street");
});
