import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getGlobalTraceProvider } from "@openai/agents";
import { createConversationalAgent } from "../src/conversational_agent.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";

if (!process.env.OPENAI_API_KEY) {
  console.error("Model eval not run: set OPENAI_API_KEY in your local environment first.");
  console.error("The key is read by the SDK and is never printed by this script.");
  process.exit(2);
}

const scenarios = JSON.parse(await readFile(new URL("./model-scenarios.json", import.meta.url), "utf8"));
const model = process.env.OPENAI_MODEL || "gpt-6-luna";
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

function makeScenarioAgent(scenario, toolResults) {
  const orders = new OrderStore([{
    ...baseOrder,
    customerId: scenario.orderOwner,
  }]);
  const requests = new RefundRequestStore();
  const orderTools = createOrderTools({
    store: orders,
    getSession: () => scenario.session,
    pinDirectory,
    quoteDeliveryPromise: () => "2026-10-20T00:00:00Z",
  });
  const refundTools = createAgentRefundTools({
    orders,
    requests,
    getSession: () => scenario.session,
    getNow: () => scenario.now,
  });
  const agent = createConversationalAgent({
    orderTools,
    refundTools,
    onToolResult: (event) => toolResults.push(event),
  });
  return { agent, requests };
}

function checkScenario(scenario, reply, toolResults, requests) {
  const expected = scenario.expected;
  assert.ok(toolResults.some((event) =>
    event.tool === expected.tool && event.code === expected.toolCode
  ), `expected tool ${expected.tool} to return ${expected.toolCode}; saw ${JSON.stringify(toolResults)}`);

  const allRequests = requests.get("refund-1") ? [requests.get("refund-1")] : [];
  assert.equal(allRequests.length, expected.refundRequestCount, "unexpected refund request count");
  if (expected.refundRequestStatus) {
    assert.equal(allRequests[0]?.status, expected.refundRequestStatus, "unexpected refund request status");
  }

  const response = reply.message.toLowerCase();
  assert.ok(expected.responseMustMentionAny.some((text) => response.includes(text)),
    `response did not mention any of: ${expected.responseMustMentionAny.join(", ")}`);
  for (const forbidden of expected.responseMustNotMentionAny) {
    assert.ok(!response.includes(forbidden.toLowerCase()), `response included prohibited text: ${forbidden}`);
  }
}

let failed = 0;
console.log(`Model-in-the-loop eval using ${model}: ${scenarios.length} scenarios`);
console.log("Each scenario makes a live OpenAI model call; traces are grouped by its conversation ID.");

for (const scenario of scenarios) {
  const traceId = `trace_${randomUUID().replaceAll("-", "")}`;
  const conversationId = randomUUID();
  const toolResults = [];
  const { agent, requests } = makeScenarioAgent(scenario, toolResults);
  let reply;
  let error;

  try {
    reply = await agent.reply([{ role: "user", content: scenario.message }], { traceId, conversationId });
  } catch (caught) {
    error = caught;
  } finally {
    try {
      await getGlobalTraceProvider().forceFlush();
    } catch (flushError) {
      console.warn(`Trace flush failed for ${traceId}: ${flushError.name}`);
    }
  }

  console.log(`\n${scenario.name}`);
  console.log(`  conversation ID: ${conversationId}`);
  console.log(`  trace ID: ${traceId}`);
  if (error) {
    failed += 1;
    console.error(`  FAIL model run: ${error.message}`);
    continue;
  }

  console.log(`  tool results: ${toolResults.map(({ tool, code }) => `${tool}=${code}`).join(", ") || "none"}`);
  console.log(`  refund requests: ${requests.get("refund-1")?.status ?? "none"}`);
  console.log(`  response: ${reply.message}`);
  try {
    checkScenario(scenario, reply, toolResults, requests);
    console.log("  eval: PASS");
  } catch (checkError) {
    failed += 1;
    console.error(`  eval: FAIL — ${checkError.message}`);
  }
}

console.log(`\n${scenarios.length - failed}/${scenarios.length} model scenarios passed`);
if (failed > 0) process.exitCode = 1;
