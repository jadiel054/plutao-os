import type { ModelConfig, ModelProviderId } from "./types";

function asProvider(v: string | undefined): ModelProviderId {
  if (v === "openai") return "openai";
  return "xai";
}

/**
 * Reads env. Returns null if MODEL_API_KEY is missing (caller should 503).
 *
 * MODEL_PROVIDER=xai|openai (default xai)
 * MODEL_API_KEY=...
 * MODEL_NAME= optional (defaults per provider)
 */
export function getModelConfig(): ModelConfig | null {
  const apiKey = process.env.MODEL_API_KEY?.trim();
  if (!apiKey) return null;

  const provider = asProvider(process.env.MODEL_PROVIDER);
  const model =
    process.env.MODEL_NAME?.trim() ||
    (provider === "openai" ? "gpt-4o-mini" : "grok-2-latest");

  const baseUrl =
    process.env.MODEL_BASE_URL?.trim() ||
    (provider === "openai" ? "https://api.openai.com/v1" : "https://api.x.ai/v1");

  return { provider, apiKey, model, baseUrl };
}
