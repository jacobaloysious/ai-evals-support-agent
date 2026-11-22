import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getGlobalTraceProvider } from "@openai/agents";
import { createConversationalAgent } from "../src/conversational_agent.js";
import { getModelSettings } from "../src/model_provider.js";
import { createOrderTools, OrderStore } from "../src/orders.js";
import { createAgentRefundTools, RefundRequestStore } from "../src/refund_requests.js";
import { gradeModelScenario } from "./model-grading.js";
import { gradeConversation } from "./conversation-grading.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_SCENARIOS = resolve(HERE, "model-scenarios.json");
const DEFAULT_CONVERSATION_SCENARIOS = resolve(HERE, "conversation-scenarios.json");
const DEFAULT_PRICING = resolve(HERE, "pricing.json");
const OUTPUT_DIR = resolve(HERE, "../eval-results");
const baseOrder = {
  id: "NS-1001", customerId: "alice", createdAt: "2026-10-01T00:00:00Z", status: "packed",
  active: true, shippedAt: null,
  deliveryAddress: { recipientName: "Alice", line1: "1 Old Street", city: "New Delhi", state: "Delhi", pin: "110001", country: "IN" },
  promisedDeliveryAt: "2026-10-15T00:00:00Z", shippingFee: 50, carrierLost: false,
};
const pinDirectory = new Map([["110001", { assigned: true, state: "Delhi", serviceable: true }]]);

function safeError(error) {
  const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : undefined;
  return {
    name: identifier(error?.name) ?? "Error",
    status: Number.isInteger(error?.status) ? error.status : null,
    code: identifier(error?.code) ?? null,
    requestId: identifier(error?.request_id ?? error?.requestId) ?? null,
  };
}

function createScenario(scenario, modelSettings, traceId, conversationId) {
  const orders = new OrderStore([{ ...baseOrder, ...scenario.order, customerId: scenario.orderOwner }]);
  const requests = new RefundRequestStore();
  const orderTools = createOrderTools({
    store: orders, getSession: () => scenario.session, pinDirectory,
    quoteDeliveryPromise: () => "2026-10-20T00:00:00Z",
  });
  const refundTools = createAgentRefundTools({ orders, requests, getSession: () => scenario.session, getNow: () => scenario.now });
  const toolResults = [];
  const agent = createConversationalAgent({
    orderTools, refundTools, modelSettings, onToolResult: (event) => toolResults.push(event),
  });
  return { agent, requests, toolResults, traceId, conversationId };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function cachedInputTokens(metrics) {
  return (metrics.requestUsageEntries ?? []).reduce((sum, entry) => {
    const detail = entry.inputTokensDetails ?? {};
    return sum + Number(detail.cached_tokens ?? detail.cachedTokens ?? 0);
  }, 0);
}

export function estimateCost(metrics, rate) {
  if (!rate || metrics.inputTokens === null || metrics.outputTokens === null) return null;
  const cached = Math.min(metrics.inputTokens, cachedInputTokens(metrics));
  const uncached = metrics.inputTokens - cached;
  return (uncached * rate.inputPerMillion
    + cached * rate.cachedInputPerMillion
    + metrics.outputTokens * rate.outputPerMillion) / 1_000_000;
}

async function runOne(scenario, provider, modelSettings, pricing, runId) {
  const traceId = `trace_${randomUUID().replaceAll("-", "")}`;
  const conversationId = randomUUID();
  const context = createScenario(scenario, modelSettings, traceId, conversationId);
  const startedAt = performance.now();
  try {
    const reply = await context.agent.reply([{ role: "user", content: scenario.message }], {
      traceId, conversationId, modelSettings,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const metrics = {
      ...reply.metrics,
      modelTurns: reply.metrics.modelRequests,
      userTurns: 1,
      requestUsageEntries: undefined,
    };
    const refund = context.requests.get("refund-1");
    const grade = gradeModelScenario(scenario, {
      response: reply.message,
      toolResults: context.toolResults,
      refundRequests: refund ? [refund] : [],
    });
    const rates = pricing.models[modelSettings.model];
    const detailedUsage = reply.usageDetails ?? null;
    return {
      scenario: scenario.name,
      scenarioType: "single-turn",
      runId,
      provider,
      model: modelSettings.model,
      traceId,
      conversationId,
      latencyMs,
      metrics: { ...metrics, toolCalls: context.toolResults.length, toolResults: context.toolResults,
        modelTurns: metrics.modelRequests,
        inputTokensDetails: detailedUsage?.inputTokensDetails ?? null,
        outputTokensDetails: detailedUsage?.outputTokensDetails ?? null },
      estimatedCostUsd: estimateCost({ ...metrics, requestUsageEntries: detailedUsage?.requestUsageEntries }, rates),
      grade,
      response: reply.message,
      refundStatus: refund?.status ?? null,
      error: null,
    };
  } catch (error) {
    return {
      scenario: scenario.name, runId, provider, model: modelSettings.model, traceId, conversationId,
      latencyMs: Math.round(performance.now() - startedAt), metrics: null, estimatedCostUsd: null,
      grade: { passed: false, failures: [{ check: "run_error", message: safeError(error).name }] },
      response: null, refundStatus: null, error: safeError(error),
    };
  } finally {
    try { await getGlobalTraceProvider().forceFlush(); }
    catch (error) { console.warn(`Trace flush failed: ${safeError(error).name}`); }
  }
}

async function runConversation(scenario, provider, modelSettings, pricing, runId) {
  const conversationId = randomUUID();
  let now = scenario.turns[0].now;
  const order = {
    ...baseOrder,
    id: scenario.orderId,
    customerId: scenario.customerId,
    promisedDeliveryAt: scenario.promisedDeliveryAt,
  };
  const orders = new OrderStore([order]);
  const requests = new RefundRequestStore();
  const session = { authenticated: true, userId: scenario.customerId, email: "alice@example.com" };
  const orderTools = createOrderTools({ store: orders, getSession: () => session, pinDirectory,
    quoteDeliveryPromise: () => "2026-10-20T00:00:00Z" });
  const refundTools = createAgentRefundTools({ orders, requests, getSession: () => session, getNow: () => now });
  const toolResults = [];
  const agent = createConversationalAgent({ orderTools, refundTools, modelSettings,
    onToolResult: (event) => toolResults.push(event) });
  const messages = [];
  const observedTurns = [];
  const allUsage = [];
  const startedAt = performance.now();
  try {
    for (const step of scenario.turns) {
      now = step.now;
      const traceId = `trace_${randomUUID().replaceAll("-", "")}`;
      messages.push({ role: "user", content: step.message });
      const previousToolCount = toolResults.length;
      const reply = await agent.reply(messages, { traceId, conversationId, modelSettings });
      messages.push({ role: "assistant", content: reply.message });
      const refund = requests.get("refund-1");
      observedTurns.push({
        name: step.name, traceId, conversationId,
        toolResults: toolResults.slice(previousToolCount),
        refundRequests: refund ? [refund] : [], response: reply.message,
        metrics: reply.metrics,
      });
      if (reply.usageDetails) allUsage.push(reply.usageDetails);
    }
    const grade = gradeConversation(scenario, { conversationId, turns: observedTurns });
    const aggregate = (field) => observedTurns.every((turn) => Number.isFinite(turn.metrics?.[field]))
      ? observedTurns.reduce((sum, turn) => sum + turn.metrics[field], 0) : null;
    const detailEntries = allUsage.flatMap((usage) => usage.requestUsageEntries ?? []);
    const metrics = {
      modelRequests: aggregate("modelRequests"), modelTurns: aggregate("modelRequests"),
      userTurns: scenario.turns.length,
      inputTokens: aggregate("inputTokens"), outputTokens: aggregate("outputTokens"), totalTokens: aggregate("totalTokens"),
      toolCalls: toolResults.length, toolResults,
      inputTokensDetails: allUsage.flatMap((usage) => usage.inputTokensDetails ?? []),
      outputTokensDetails: allUsage.flatMap((usage) => usage.outputTokensDetails ?? []),
      requestUsageEntries: detailEntries,
    };
    const refund = requests.get("refund-1");
    return {
      scenario: scenario.name, scenarioType: "conversation", runId, provider, model: modelSettings.model,
      traceId: observedTurns.map((turn) => turn.traceId), conversationId,
      latencyMs: Math.round(performance.now() - startedAt), metrics,
      estimatedCostUsd: estimateCost(metrics, pricing.models[modelSettings.model]),
      grade, response: observedTurns.map((turn) => `${turn.name}: ${turn.response}`).join("\n\n"),
      refundStatus: refund?.status ?? null, error: null,
    };
  } catch (error) {
    return {
      scenario: scenario.name, scenarioType: "conversation", runId, provider, model: modelSettings.model,
      traceId: observedTurns.map((turn) => turn.traceId), conversationId,
      latencyMs: Math.round(performance.now() - startedAt), metrics: null, estimatedCostUsd: null,
      grade: { passed: false, failures: [{ check: "run_error", message: safeError(error).name }] },
      response: null, refundStatus: null, error: safeError(error),
    };
  } finally {
    try { await getGlobalTraceProvider().forceFlush(); }
    catch (error) { console.warn(`Trace flush failed: ${safeError(error).name}`); }
  }
}

function summarize(results, provider, model) {
  const completed = results.filter((result) => result.metrics);
  const sum = (field) => completed.every((result) => Number.isFinite(result.metrics[field]))
    ? completed.reduce((value, result) => value + result.metrics[field], 0) : null;
  const costs = completed.map((result) => result.estimatedCostUsd).filter(Number.isFinite);
  const latencies = completed.map((result) => result.latencyMs);
  const gradeChecks = results.flatMap((result) => result.grade.failures);
  return {
    provider, model,
    scenarioCount: results.length,
    completedScenarios: completed.length,
    passedScenarios: results.filter((result) => result.grade.passed).length,
    qualityPassRate: results.length ? results.filter((result) => result.grade.passed).length / results.length : null,
    failedChecks: gradeChecks.length,
    modelRequests: sum("modelRequests"),
    modelTurns: sum("modelTurns"),
    userTurns: sum("userTurns"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    toolCalls: completed.reduce((total, result) => total + result.metrics.toolCalls, 0),
    medianLatencyMs: median(latencies),
    p95LatencyMs: percentile(latencies, 0.95),
    totalEstimatedCostUsd: costs.length === completed.length && completed.length ? costs.reduce((a, b) => a + b, 0) : null,
    costCoverage: `${costs.length}/${results.length}`,
  };
}

/** Run the same scenarios against both providers and save a comparable, key-free report. */
export async function runComparison({
  scenariosPath = process.env.MODEL_EVAL_SCENARIOS || DEFAULT_SCENARIOS,
  conversationScenariosPath = process.env.CONVERSATION_EVAL_SCENARIOS || DEFAULT_CONVERSATION_SCENARIOS,
  pricingPath = process.env.MODEL_EVAL_PRICING || DEFAULT_PRICING,
  outputDir = OUTPUT_DIR,
} = {}) {
  const scenarios = JSON.parse(await readFile(scenariosPath, "utf8"));
  const conversationScenarios = JSON.parse(await readFile(conversationScenariosPath, "utf8"));
  const allScenarios = [
    ...scenarios.map((scenario) => ({ ...scenario, scenarioType: "single-turn" })),
    ...conversationScenarios.map((scenario) => ({ ...scenario, scenarioType: "conversation" })),
  ];
  const pricing = JSON.parse(await readFile(pricingPath, "utf8"));
  const [singleTurnText, conversationText] = await Promise.all([
    readFile(scenariosPath, "utf8"), readFile(conversationScenariosPath, "utf8"),
  ]);
  const sourceRevision = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERE, encoding: "utf8" }).trim(); } catch { return null; } })();
  const workingTreeDirty = (() => { try { return Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: HERE, encoding: "utf8" }).trim()); } catch { return null; } })();
  const openai = getModelSettings({ ...process.env, MODEL_PROVIDER: "openai" });
  const meta = getModelSettings({ ...process.env, MODEL_PROVIDER: "meta" });
  const runId = new Date().toISOString().replaceAll(/[:.]/g, "-") + "_" + randomUUID().slice(0, 8);
  const rows = [];
  console.log(`Comparing ${openai.model} with ${meta.model} on ${allScenarios.length} identical scenarios (${scenarios.length} single-turn, ${conversationScenarios.length} conversation).`);
  console.log("Live API calls incur provider usage charges. Results and metrics are saved locally; API keys are not saved.");
  for (const scenario of allScenarios) {
    // Alternate provider order between scenarios to reduce order-related timing bias.
    const order = rows.length / 2 % 2 === 0 ? [openai, meta] : [meta, openai];
    for (const settings of order) {
      const result = scenario.scenarioType === "conversation"
        ? await runConversation(scenario, settings.provider, settings, pricing, runId)
        : await runOne(scenario, settings.provider, settings, pricing, runId);
      rows.push(result);
      console.log(`${settings.provider} | ${scenario.name} | ${result.grade.passed ? "PASS" : "FAIL"} | ${result.latencyMs} ms`);
    }
  }
  const report = {
    schemaVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    scenarioFiles: ["evals/model-scenarios.json", "evals/conversation-scenarios.json"],
    scenarioCount: allScenarios.length,
    scenarioCounts: { singleTurn: scenarios.length, conversations: conversationScenarios.length },
    repeatsPerScenario: 1,
    pricingEffectiveDate: pricing.effectiveDate,
    pricingSources: pricing.sources,
    sourceRevision,
    workingTreeDirty,
    scenarioHashes: {
      singleTurnSha256: createHash("sha256").update(singleTurnText).digest("hex"),
      conversationSha256: createHash("sha256").update(conversationText).digest("hex"),
    },
    note: "A single pass is directional. Repeat runs under similar conditions before making a migration decision. Estimated costs use the checked-in pricing rates, not provider invoices.",
    summaries: [summarize(rows.filter((row) => row.provider === "openai"), "openai", openai.model),
      summarize(rows.filter((row) => row.provider === "meta"), "meta", meta.model)],
    results: rows,
  };
  await mkdir(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, `${runId}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(`\nSaved comparison report: ${reportPath}`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runComparison();
  } catch (error) {
    console.error(`Comparison not run: ${safeError(error).name}: ${error.message}`);
    process.exitCode = 2;
  }
}
