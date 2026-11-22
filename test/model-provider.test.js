import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getModelSettings } from "../src/model_provider.js";
import { estimateCost } from "../evals/compare-models.js";

const pricing = JSON.parse(await readFile(new URL("../evals/pricing.json", import.meta.url), "utf8"));

test("OpenAI is the default provider and requires its server-side key", () => {
  assert.throws(() => getModelSettings({}), /Set OPENAI_API_KEY on the server/);
  const settings = getModelSettings({ OPENAI_API_KEY: "test-only", OPENAI_MODEL: "test-model" });
  assert.equal(settings.provider, "openai");
  assert.equal(settings.model, "test-model");
  assert.equal(settings.modelProvider, undefined);
});

test("Meta uses its explicit key, compatible endpoint, and model ID", () => {
  const settings = getModelSettings({ MODEL_PROVIDER: "meta", META_MODEL_API_KEY: "test-only", META_MODEL: "test-meta-model" });
  assert.equal(settings.provider, "meta");
  assert.equal(settings.model, "test-meta-model");
  assert.ok(settings.modelProvider);
});

test("Meta accepts documented MODEL_API_KEY but rejects unknown providers", () => {
  assert.equal(getModelSettings({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "test-only" }).model, "muse-spark-1.3");
  assert.throws(() => getModelSettings({ MODEL_PROVIDER: "other" }), /MODEL_PROVIDER must be either/);
});

test("comparison can apply a shared reasoning effort", () => {
  const openai = getModelSettings({ OPENAI_API_KEY: "test-only", MODEL_REASONING_EFFORT: "medium" });
  const meta = getModelSettings({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "test-only", MODEL_REASONING_EFFORT: "medium" });
  assert.equal(openai.reasoningEffort, "medium");
  assert.equal(meta.reasoningEffort, "medium");
  assert.throws(() => getModelSettings({ OPENAI_API_KEY: "test-only", MODEL_REASONING_EFFORT: "ultra" }), /MODEL_REASONING_EFFORT/);
  assert.throws(() => getModelSettings({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "test-only", MODEL_REASONING_EFFORT: "xhigh" }), /not supported by the meta provider/);
});

test("standard API pricing is recorded for both the baseline and Meta candidate models", () => {
  assert.deepEqual(pricing.models["gpt-6-luna"], {
    provider: "openai", inputPerMillion: 0.1, cachedInputPerMillion: 0.01, outputPerMillion: 0.5,
  });
  assert.deepEqual(pricing.models["muse-ember-1.0"], {
    provider: "meta", inputPerMillion: 0.1, cachedInputPerMillion: 0.004, outputPerMillion: 0.5,
  });
  assert.equal(estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, pricing.models["gpt-6-luna"]), 0.6);
});

test("token cost includes cached input at its discounted rate and preserves missing usage", () => {
  const cost = estimateCost({
    inputTokens: 1000,
    outputTokens: 500,
    requestUsageEntries: [{ inputTokensDetails: { cached_tokens: 200 } }],
  }, { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2 });
  assert.equal(cost, (800 + 20 + 1000) / 1_000_000);
  assert.equal(estimateCost({ inputTokens: null, outputTokens: null }, { inputPerMillion: 1, outputPerMillion: 1 }), null);
});
