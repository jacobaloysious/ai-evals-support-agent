import assert from "node:assert/strict";
import test from "node:test";
import {
  addressChangeMessage,
  createOrderTools,
  OrderStore,
  orderLookupMessage,
  orderRecoveryMessage,
} from "../src/orders.js";

const oldAddress = {
  recipientName: "Alice",
  line1: "1 Old Street",
  city: "New Delhi",
  state: "Delhi",
  pin: "110001",
  country: "IN",
};
const newAddress = { ...oldAddress, line1: "2 New Street" };
const original = {
  id: "order-100",
  customerId: "alice",
  createdAt: "2026-10-01T00:00:00Z",
  status: "packed",
  active: true,
  shippedAt: null,
  deliveryAddress: oldAddress,
  promisedDeliveryAt: "2026-10-08T00:00:00Z",
};
const shipped = {
  ...original,
  id: "order-101",
  createdAt: "2026-10-03T00:00:00Z",
  status: "shipped",
  shippedAt: "2026-10-03T12:00:00Z",
};
const bobsOrder = {
  ...original,
  id: "order-200",
  customerId: "bob",
  createdAt: "2026-10-04T00:00:00Z",
};

// These records are deterministic course fixtures, not a live postal directory.
const pinDirectory = new Map([
  ["110001", { assigned: true, state: "Delhi", serviceable: true }],
  ["560001", { assigned: true, state: "Karnataka", serviceable: false }],
]);

function fixture(session, orders = [original, shipped, bobsOrder], quote = () => "2026-10-12T00:00:00Z") {
  const store = new OrderStore(orders);
  const tools = createOrderTools({
    store,
    getSession: () => session,
    pinDirectory,
    quoteDeliveryPromise: quote,
  });
  return { store, tools };
}

const alice = { authenticated: true, userId: "alice", email: "alice@example.com", token: "never-expose" };

test("owner can read only permitted order details", () => {
  const { tools } = fixture(alice);
  assert.deepEqual(tools.getOrder({ orderId: original.id }), {
    ok: true,
    code: "ORDER_FOUND",
    order: {
      id: original.id,
      status: "packed",
      shippedAt: null,
      deliveryAddress: oldAddress,
      promisedDeliveryAt: original.promisedDeliveryAt,
    },
  });
});

test("another customer cannot read an order even by supplying its owner's ID", () => {
  const { tools } = fixture({ authenticated: true, userId: "bob" });
  assert.deepEqual(tools.getOrder({ orderId: original.id, customerId: "alice" }), {
    ok: false, code: "ORDER_NOT_ACCESSIBLE",
  });
});

test("unauthenticated customer cannot read an order", () => {
  const { tools } = fixture(null);
  assert.deepEqual(tools.getOrder({ orderId: original.id }), { ok: false, code: "AUTH_REQUIRED" });
});

test("unknown and other-owned orders have the same safe explanation", () => {
  const { tools } = fixture({ authenticated: true, userId: "bob" });
  const otherOwned = tools.getOrder({ orderId: original.id });
  const missing = tools.getOrder({ orderId: "missing-order" });
  assert.deepEqual(otherOwned, missing);
  assert.equal(orderLookupMessage(otherOwned), orderLookupMessage(missing));
  assert.match(orderLookupMessage(missing), /under the account you're signed into/);
});

test("lists only the signed-in account's orders with unshipped first and minimal fields", () => {
  const { tools } = fixture(alice);
  assert.deepEqual(tools.listMyOrders(), {
    ok: true,
    code: "ORDERS_FOUND",
    account: "a***@example.com",
    orders: [
      { id: original.id, createdAt: original.createdAt, status: "packed" },
      { id: shipped.id, createdAt: shipped.createdAt, status: "shipped" },
    ],
  });
});

test("recovery message names the masked account and offers another-account guidance", () => {
  const { tools } = fixture(alice);
  const message = orderRecoveryMessage(tools.listMyOrders());
  assert.match(message, /a\*\*\*@example.com/);
  assert.ok(message.indexOf("order-100") < message.indexOf("order-101"));
  assert.match(message, /sign in to another account/);
  assert.doesNotMatch(message, /1 Old Street|never-expose|order-200/);
});

test("does not list orders without authentication", () => {
  const { tools } = fixture(null);
  assert.deepEqual(tools.listMyOrders(), { ok: false, code: "AUTH_REQUIRED" });
});

test("rejects an unauthenticated address change without mutation", () => {
  const { store, tools } = fixture(null);
  assert.deepEqual(tools.changeAddress({ orderId: original.id, newAddress }), {
    ok: false, code: "AUTH_REQUIRED",
  });
  assert.deepEqual(store.getOrderForOwner(original.id, "alice").deliveryAddress, oldAddress);
});

test("does not let a signed-in customer change someone else's address", () => {
  const { store, tools } = fixture({ authenticated: true, userId: "bob" });
  assert.deepEqual(tools.changeAddress({ orderId: original.id, newAddress, customerId: "alice" }), {
    ok: false, code: "ORDER_NOT_ACCESSIBLE",
  });
  assert.deepEqual(store.getOrderForOwner(original.id, "alice").deliveryAddress, oldAddress);
});

test("allows a packed but unshipped address change and resets the promise", () => {
  const { store, tools } = fixture(alice);
  assert.deepEqual(tools.changeAddress({ orderId: original.id, newAddress }), {
    ok: true,
    code: "ADDRESS_CHANGED",
    orderId: original.id,
    deliveryAddress: newAddress,
    promisedDeliveryAt: "2026-10-12T00:00:00Z",
  });
  assert.equal(store.getOrderForOwner(original.id, "alice").promisedDeliveryAt, "2026-10-12T00:00:00Z");
});

test("save-time check declines an order shipped after the earlier read", () => {
  const store = new OrderStore([original]);
  const tools = createOrderTools({
    store,
    getSession: () => alice,
    pinDirectory,
    quoteDeliveryPromise: () => {
      store.markShipped(original.id, "2026-10-04T00:00:00Z");
      return "2026-10-12T00:00:00Z";
    },
  });
  assert.deepEqual(tools.changeAddress({ orderId: original.id, newAddress }), {
    ok: false, code: "ALREADY_SHIPPED",
  });
  assert.deepEqual(store.getOrderForOwner(original.id, "alice").deliveryAddress, oldAddress);
});

test("rejects an unassigned six-digit PIN", () => {
  const { tools } = fixture(alice);
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: { ...newAddress, pin: "999999" },
  }), { ok: false, code: "PIN_NOT_FOUND" });
});

test("rejects a malformed PIN and non-India destination", () => {
  const { tools } = fixture(alice);
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: { ...newAddress, pin: "11001" },
  }), { ok: false, code: "INVALID_PIN_FORMAT" });
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: { ...newAddress, country: "US" },
  }), { ok: false, code: "COUNTRY_UNSUPPORTED" });
});

test("rejects a valid fixture PIN outside shop coverage", () => {
  const { tools } = fixture(alice);
  assert.deepEqual(tools.changeAddress({
    orderId: original.id,
    newAddress: { ...newAddress, pin: "560001", state: "Karnataka" },
  }), { ok: false, code: "PIN_NOT_SERVICEABLE" });
});

test("state and PIN mismatch asks for confirmation and makes no change", () => {
  const { store, tools } = fixture(alice);
  const result = tools.changeAddress({
    orderId: original.id,
    newAddress: { ...newAddress, state: "Karnataka" },
  });
  assert.deepEqual(result, {
    ok: false,
    code: "STATE_PIN_MISMATCH",
    pin: "110001",
    submittedState: "Karnataka",
    postalState: "Delhi",
  });
  assert.match(addressChangeMessage(result), /PIN 110001 is listed for Delhi/);
  assert.match(addressChangeMessage(result), /address you entered says Karnataka/);
  assert.match(addressChangeMessage(result), /confirm the correct details/);
  assert.deepEqual(store.getOrderForOwner(original.id, "alice").deliveryAddress, oldAddress);
});

test("confirmation requirement survives a new agent tool instance", () => {
  const { store, tools } = fixture(alice);
  tools.changeAddress({ orderId: original.id, newAddress: { ...newAddress, state: "Karnataka" } });
  const restartedTools = createOrderTools({
    store,
    getSession: () => alice,
    pinDirectory,
    quoteDeliveryPromise: () => "2026-10-12T00:00:00Z",
  });
  assert.deepEqual(restartedTools.changeAddress({ orderId: original.id, newAddress }), {
    ok: false, code: "CONFIRMATION_REQUIRED",
  });
  assert.deepEqual(store.getOrderForOwner(original.id, "alice").deliveryAddress, oldAddress);
});

test("does not change an address without a trusted revised promise", () => {
  const { store, tools } = fixture(alice, [original], () => null);
  assert.deepEqual(tools.changeAddress({ orderId: original.id, newAddress }), {
    ok: false, code: "PROMISE_UNAVAILABLE",
  });
  assert.deepEqual(store.getOrderForOwner(original.id, "alice").deliveryAddress, oldAddress);
});
