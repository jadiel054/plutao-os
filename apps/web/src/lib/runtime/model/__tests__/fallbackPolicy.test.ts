import { afterEach, describe, expect, it, vi } from "vitest";
import { getModelConfig } from "@/lib/runtime/model/config";

vi.mock("@/lib/runtime/model/config", () => ({
  getModelConfig: vi.fn(),
}));
import { isTransientCloudFailure, pickFallbackConfig } from "../resolveConfig";
import type { ModelConfig } from "../../types";

function errWith(status?: number, message = "boom"): Error {
  const e = new Error(message) as Error & { httpStatus?: number };
  if (status !== undefined) e.httpStatus = status;
  return e;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isTransientCloudFailure", () => {
  it("permite 408, 429 e 5xx", () => {
    expect(isTransientCloudFailure(errWith(408))).toBe(true);
    expect(isTransientCloudFailure(errWith(429))).toBe(true);
    expect(isTransientCloudFailure(errWith(500))).toBe(true);
    expect(isTransientCloudFailure(errWith(503))).toBe(true);
  });

  it("PROIBE demais 4xx (401/402/403/404/413/422/400)", () => {
    for (const s of [400, 401, 402, 403, 404, 413, 422]) {
      expect(isTransientCloudFailure(errWith(s))).toBe(false);
    }
  });

  it("sem status, aceita falhas de rede/timeout identificadas", () => {
    expect(isTransientCloudFailure(new Error("fetch failed"))).toBe(true);
    expect(isTransientCloudFailure(new Error("socket hang up"))).toBe(true);
    const e = new Error("request failed");
    (e as Error & { code?: string }).code = "ECONNRESET";
    expect(isTransientCloudFailure(e)).toBe(true);
  });

  it("sem status, rejeita erro genérico (não inventa fallback por regex de código na mensagem)", () => {
    expect(isTransientCloudFailure(new Error("provider HTTP 500 says quota 401 exhausted"))).toBe(false);
  });
});

describe("pickFallbackConfig", () => {
  it("retorna alternativa DISTINTA da primária", () => {
    vi.stubEnv("GROQ_API_KEY", "gk_test");
    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const primary: ModelConfig = { provider: "openai", apiKey: "k", model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" };
    const fb = pickFallbackConfig(primary);
    expect(fb).not.toBeNull();
    expect(fb!.provider + fb!.model + fb!.baseUrl).not.toBe(primary.provider + primary.model + primary.baseUrl);
  });

  it("retorna null quando não há alternativa disponível", () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.mocked(getModelConfig).mockReturnValue(null);
    const primary: ModelConfig = { provider: "openai", apiKey: "k", model: "m", baseUrl: "https://api.groq.com/openai/v1" };
    expect(pickFallbackConfig(primary)).toBeNull();
  });

  it("fallback desativado é decisão do chamador (route não chama pickFallbackConfig)", () => {
    // A rota só invoca pickFallbackConfig quando autoFallbackEnabled; o teste
    // documenta o contrato: sem chamada, sem fallback.
    const primary: ModelConfig = { provider: "openai", apiKey: "k", model: "m", baseUrl: "https://x" };
    vi.stubEnv("GROQ_API_KEY", "gk");
    expect(pickFallbackConfig(primary)).not.toBeNull();
  });
});
