import { createSupportAgent } from "../src/agent.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";

const order = {
  id: "NS-1001",
  customerId: "alice",
  createdAt: "2026-10-01T00:00:00Z",
  status: "packed",
  active: true,
  shippedAt: null,
  deliveryAddress: {
    recipientName: "Alice",
    line1: "1 Old Street",
    city: "New Delhi",
    state: "Delhi",
    pin: "110001",
    country: "IN",
  },
  promisedDeliveryAt: "2026-10-12T00:00:00Z",
  shippingFee: 50,
};
const session = { authenticated: true, userId: "alice", email: "alice@example.com" };
const orders = new OrderStore([order]);
const requests = new RefundRequestStore();
const pinDirectory = new Map([["110001", { assigned: true, state: "Delhi", serviceable: true }]]);
let now = "2026-10-11T00:00:00Z";
let customerConfirmedAddress = null;

const agent = createSupportAgent({
  orderTools: createOrderTools({
    store: orders,
    getSession: () => session,
    pinDirectory,
    quoteDeliveryPromise: () => "2026-10-15T00:00:00Z",
    consumeAddressConfirmation: ({ orderId, customerId, newAddress }) =>
      customerConfirmedAddress !== null && orderId === order.id && customerId === "alice"
      && JSON.stringify(newAddress) === JSON.stringify(customerConfirmedAddress),
  }),
  refundTools: createAgentRefundTools({
    orders,
    requests,
    getSession: () => session,
    getNow: () => now,
  }),
});

function show(label, proposal) {
  const result = agent.handleProposal(proposal);
  console.log(`${label}: ${result.outcome}\n${result.message}\n`);
}

show("1. Mismatched address", {
  action: "change_address",
  args: { orderId: order.id, newAddress: { ...order.deliveryAddress, state: "Karnataka" } },
});
customerConfirmedAddress = { ...order.deliveryAddress, line1: "2 New Street" };
// The server records the customer's reply for this exact corrected address.
show("2. Corrected address", {
  action: "change_address",
  args: { orderId: order.id, newAddress: customerConfirmedAddress },
});
show("3. Refund before revised promise", {
  action: "request_shipping_refund",
  args: { orderId: order.id, reason: "Where is my package?" },
});
now = "2026-10-16T00:00:00Z";
show("4. Refund after revised promise", {
  action: "request_shipping_refund",
  args: { orderId: order.id, reason: "The package is late" },
});

console.log(`Review queue: ${requests.get("refund-1")?.status ?? "empty"}`);
