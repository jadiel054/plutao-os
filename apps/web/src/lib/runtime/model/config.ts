import type { ModelConfig, ModelProviderId } from "./types";

function asProvider(v: string | undefined): ModelProviderId {
  if (v === "openai") return "openai";
  if (v === "gemini") return "gemini";
  if (v === "local") return "local";
  return "xai";
}

/**
 * Lê env do servidor. Retorna null se não houver chave (caller trata).
 *
 * MODEL_PROVIDER=xai|openai|gemini (default xai)
 * MODEL_API_KEY=...  (ou XAI_API_KEY / OPENAI_API_KEY conforme provedor)
 * MODEL_NAME= opcional (default atual por provedor)
 * MODEL_BASE_URL= opcional
 */
export function getModelConfig(): ModelConfig | null {
  const provider = asProvider(process.env.MODEL_PROVIDER);

  const apiKey =
    process.env.MODEL_API_KEY?.trim() ||
    (provider === "openai"
      ? process.env.OPENAI_API_KEY?.trim()
      : provider === "gemini"
        ? process.env.GEMINI_API_KEY?.trim()
        : process.env.XAI_API_KEY?.trim()) ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.XAI_API_KEY?.trim();

  if (!apiKey) return null;

  const model =
    process.env.MODEL_NAME?.trim() ||
    (provider === "openai"
      ? "gpt-4o-mini"
      : provider === "gemini"
        ? "gemini-3.1-flash-lite"
        : "grok-4.6");

  const baseUrl =
    process.env.MODEL_BASE_URL?.trim() ||
    (provider === "openai"
      ? "https://api.openai.com/v1"
      : provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/openai"
        : "https://api.x.ai/v1");

  return { provider, apiKey, model, baseUrl };
}
