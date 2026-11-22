import test from "node:test";
import assert from "node:assert/strict";
import { getModelSettings } from "../src/model_provider.js";
import { estimateCost } from "../evals/compare-models.js";

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

test("token cost includes cached input at its discounted rate and preserves missing usage", () => {
  const cost = estimateCost({
    inputTokens: 1000,
    outputTokens: 500,
    requestUsageEntries: [{ inputTokensDetails: { cached_tokens: 200 } }],
  }, { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2 });
  assert.equal(cost, (800 + 20 + 1000) / 1_000_000);
  assert.equal(estimateCost({ inputTokens: null, outputTokens: null }, { inputPerMillion: 1, outputPerMillion: 1 }), null);
});
