import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getGlobalTraceProvider } from "@openai/agents";
import { createConversationalAgent } from "../src/conversational_agent.js";
import { getModelSettings } from "../src/model_provider.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";
import { gradeModelScenario } from "./model-grading.js";

let modelSettings;
try { modelSettings = getModelSettings(); }
catch (error) { console.error(`Model eval not run: ${error.message}`); process.exit(2); }

const scenariosPath = process.env.MODEL_EVAL_SCENARIOS || "./model-scenarios.json";
const scenarios = JSON.parse(await readFile(new URL(scenariosPath, import.meta.url), "utf8"));
const model = modelSettings.model;
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
    ...scenario.order,
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
    modelSettings,
    onToolResult: (event) => toolResults.push(event),
  });
  return { agent, requests };
}

let failed = 0;
console.log(`Model-in-the-loop eval using ${model}: ${scenarios.length} scenarios (${scenariosPath})`);
console.log("Each scenario makes one live agent run, which can make multiple model requests; traces are grouped by conversation ID.");

for (const scenario of scenarios) {
  const traceId = `trace_${randomUUID().replaceAll("-", "")}`;
  const conversationId = randomUUID();
  const toolResults = [];
  const { agent, requests } = makeScenarioAgent(scenario, toolResults);
  const startedAt = Date.now();
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
  console.log(`  tool calls: ${toolResults.length}`);
  console.log(`  elapsed: ${Date.now() - startedAt} ms`);
  console.log(`  refund requests: ${requests.get("refund-1")?.status ?? "none"}`);
  console.log(`  response: ${reply.message}`);
  const firstRequest = requests.get("refund-1");
  const grade = gradeModelScenario(scenario, {
    response: reply.message,
    toolResults,
    refundRequests: firstRequest ? [firstRequest] : [],
  });
  if (grade.passed) {
    console.log("  eval: PASS");
  } else {
    failed += 1;
    console.error("  eval: FAIL");
    for (const failure of grade.failures) {
      console.error(`    ${failure.check}: ${failure.message}`);
    }
  }
}

console.log(`\n${scenarios.length - failed}/${scenarios.length} model scenarios passed`);
if (failed > 0) process.exitCode = 1;
