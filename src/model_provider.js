import { OpenAIProvider } from "@openai/agents";

const DEFAULT_META_BASE_URL = "https://api.meta.ai/v1";
const OPENAI_REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const META_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "max"]);

/** Resolve provider settings once on the server. API keys never enter browser code. */
export function getModelSettings(env = process.env) {
  const provider = env.MODEL_PROVIDER || "openai";
  const reasoningEffort = env.MODEL_REASONING_EFFORT || undefined;
  if (!new Set(["openai", "meta"]).has(provider)) {
    throw new Error("MODEL_PROVIDER must be either 'openai' or 'meta'.");
  }
  const supportedEfforts = provider === "meta" ? META_REASONING_EFFORTS : OPENAI_REASONING_EFFORTS;
  if (reasoningEffort && !supportedEfforts.has(reasoningEffort)) {
    throw new Error(`MODEL_REASONING_EFFORT is not supported by the ${provider} provider.`);
  }

  if (provider === "meta") {
    const apiKey = env.META_MODEL_API_KEY || env.MODEL_API_KEY;
    if (!apiKey) throw new Error("Set META_MODEL_API_KEY (or Meta's documented MODEL_API_KEY) on the server.");
    return {
      provider,
      model: env.META_MODEL || "muse-spark-1.3",
      reasoningEffort,
      modelProvider: new OpenAIProvider({
        apiKey,
        baseURL: env.META_MODEL_BASE_URL || DEFAULT_META_BASE_URL,
        useResponses: true,
      }),
    };
  }

  if (!env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY on the server.");
  return {
    provider,
    model: env.OPENAI_MODEL || "gpt-6-luna",
    reasoningEffort,
    // The Agents SDK default provider reads OPENAI_API_KEY from the server env.
    modelProvider: undefined,
  };
}
