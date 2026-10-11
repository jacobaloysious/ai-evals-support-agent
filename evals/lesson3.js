import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSupportAgent } from "../src/agent.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";

const scenariosPath = new URL("./lesson3-scenarios.json", import.meta.url);
const scenarios = JSON.parse(await readFile(scenariosPath, "utf8"));

const baseOrder = {
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
  promisedDeliveryAt: "2026-10-15T00:00:00Z",
  shippingFee: 50,
  carrierLost: false,
};
const pinDirectory = new Map([[
  "110001",
  { assigned: true, state: "Delhi", serviceable: true },
]]);

function runScenario(scenario) {
  // Each scenario gets fresh stores so one run cannot affect another.
  const order = { ...baseOrder, ...scenario.order };
  const orders = new OrderStore([order]);
  const refundRequests = new RefundRequestStore();
  const orderTools = createOrderTools({
    store: orders,
    getSession: () => scenario.session,
    pinDirectory,
    quoteDeliveryPromise: () => "2026-10-20T00:00:00Z",
  });
  const refundTools = createAgentRefundTools({
    orders,
    requests: refundRequests,
    getSession: () => scenario.session,
    getNow: () => scenario.now,
  });
  const agent = createSupportAgent({ orderTools, refundTools });
  const result = agent.handleProposal(scenario.proposal);
  // Each scenario makes at most one tool call; inspect the store regardless of owner.
  const firstRequest = refundRequests.get("refund-1");
  const requests = firstRequest ? [firstRequest] : [];

  return { result, requests };
}

let failures = 0;
console.log(`Lesson 3 deterministic eval: ${scenarios.length} scenarios`);

for (const scenario of scenarios) {
  const { result, requests } = runScenario(scenario);
  const checks = [
    ["outcome", () => assert.equal(result.outcome, scenario.expected.outcome)],
    ["refund request count", () => assert.equal(requests.length, scenario.expected.refundRequestCount)],
  ];
  if (scenario.expected.refundRequestStatus) {
    checks.push(["refund request status", () => assert.equal(requests[0]?.status, scenario.expected.refundRequestStatus)]);
  }
  if (scenario.expected.messageIncludes) {
    checks.push(["customer explanation", () => assert.ok(result.message.includes(scenario.expected.messageIncludes))]);
  }

  const failedChecks = [];
  for (const [label, check] of checks) {
    try {
      check();
    } catch (error) {
      failedChecks.push({ label, message: error.message });
    }
  }

  console.log(`\n${failedChecks.length === 0 ? "PASS" : "FAIL"} ${scenario.name}`);
  console.log(`  proposal: ${scenario.proposal.action} for ${scenario.proposal.args.orderId}`);
  console.log(`  agent outcome: ${result.outcome}`);
  console.log(`  refund requests: ${requests.length}${requests[0] ? ` (${requests[0].status})` : ""}`);
  console.log(`  response: ${result.message}`);
  for (const failure of failedChecks) {
    failures += 1;
    console.error(`  failed ${failure.label}: ${failure.message}`);
  }
}

console.log(`\n${scenarios.length - failures}/${scenarios.length} scenario checks passed`);
if (failures > 0) process.exitCode = 1;
