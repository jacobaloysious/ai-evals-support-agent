import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getGlobalTraceProvider } from "@openai/agents";
import { createConversationalAgent } from "../src/conversational_agent.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";
import { gradeConversation } from "./conversation-grading.js";

if (!process.env.OPENAI_API_KEY) {
  console.error("Conversation eval not run: set OPENAI_API_KEY in your local environment first.");
  console.error("The key is read by the SDK and is never printed by this script.");
  process.exit(2);
}

const scenarios = JSON.parse(await readFile(new URL("./conversation-scenarios.json", import.meta.url), "utf8"));
const model = process.env.OPENAI_MODEL || "gpt-6-luna";
const pinDirectory = new Map([[
  "110001",
  { assigned: true, state: "Delhi", serviceable: true },
]]);

async function runScenario(scenario) {
  const conversationId = randomUUID();
  let now = scenario.turns[0].now;
  const order = {
    id: scenario.orderId,
    customerId: scenario.customerId,
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
    promisedDeliveryAt: scenario.promisedDeliveryAt,
    shippingFee: 50,
    carrierLost: false,
  };
  const orders = new OrderStore([order]);
  const requests = new RefundRequestStore();
  const session = { authenticated: true, userId: scenario.customerId, email: "alice@example.com" };
  const orderTools = createOrderTools({
    store: orders,
    getSession: () => session,
    pinDirectory,
    quoteDeliveryPromise: () => "2026-10-20T00:00:00Z",
  });
  const refundTools = createAgentRefundTools({
    orders,
    requests,
    getSession: () => session,
    getNow: () => now,
  });
  const toolResults = [];
  const agent = createConversationalAgent({
    orderTools,
    refundTools,
    onToolResult: (event) => toolResults.push(event),
  });
  const messages = [];
  const turns = [];

  for (const step of scenario.turns) {
    now = step.now;
    const traceId = `trace_${randomUUID().replaceAll("-", "")}`;
    messages.push({ role: "user", content: step.message });
    const previousToolCount = toolResults.length;
    const reply = await agent.reply(messages, { traceId, conversationId });
    messages.push({ role: "assistant", content: reply.message });
    const firstRequest = requests.get("refund-1");
    turns.push({
      name: step.name,
      traceId,
      conversationId,
      toolResults: toolResults.slice(previousToolCount),
      refundRequests: firstRequest ? [firstRequest] : [],
      response: reply.message,
    });
    try {
      await getGlobalTraceProvider().forceFlush();
    } catch (error) {
      console.warn(`Trace flush failed for ${traceId}: ${error.name}`);
    }
  }

  return { conversationId, turns };
}

let failed = 0;
console.log(`Multi-turn model eval using ${model}: ${scenarios.length} conversation(s)`);
console.log("Each conversation turn receives the complete accumulated message history.");

for (const scenario of scenarios) {
  console.log(`\n${scenario.name}`);
  try {
    const actual = await runScenario(scenario);
    console.log(`  conversation ID: ${actual.conversationId}`);
    for (const turn of actual.turns) {
      console.log(`  ${turn.name}: trace ${turn.traceId}`);
      console.log(`    tools: ${turn.toolResults.map(({ tool, code }) => `${tool}=${code}`).join(", ") || "none"}`);
      console.log(`    refund requests: ${turn.refundRequests.map(({ status }) => status).join(", ") || "none"}`);
      console.log(`    response: ${turn.response}`);
    }
    const grade = gradeConversation(scenario, actual);
    if (grade.passed) {
      console.log("  conversation eval: PASS");
    } else {
      failed += 1;
      console.error("  conversation eval: FAIL");
      for (const failure of grade.failures) {
        console.error(`    ${failure.check}: ${failure.message}`);
      }
    }
  } catch (error) {
    failed += 1;
    try {
      await getGlobalTraceProvider().forceFlush();
    } catch (flushError) {
      console.warn(`Trace flush failed: ${flushError.name}`);
    }
    console.error(`  conversation run failed: ${error.message}`);
  }
}

console.log(`\n${scenarios.length - failed}/${scenarios.length} conversation evals passed`);
if (failed > 0) process.exitCode = 1;
