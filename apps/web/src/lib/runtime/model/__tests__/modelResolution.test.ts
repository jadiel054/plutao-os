import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveCloudModelConfig, resolveConfiguredCloudModelConfig } from "../resolveConfig";
import { formatModelLabel } from "../label";

describe("Resolução de model id no runtime de missões (sem prefixo duplicado)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolve 'groq/gpt-oss-120b' para o apiModel da Groq", () => {
    process.env.GROQ_API_KEY = "test-key";
    const resolved = resolveCloudModelConfig("groq/gpt-oss-120b");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.model).toBe("openai/gpt-oss-120b");
      expect(resolved.config.baseUrl).toBe("https://api.groq.com/openai/v1");
    }
  });

  it("aceita chave específica do modelo preferido sem exigir MODEL_API_KEY", () => {
    delete process.env.MODEL_API_KEY;
    process.env.OPENAI_API_KEY = "specific-openai-key";

    const resolved = resolveConfiguredCloudModelConfig("openai/gpt-4o-mini");

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.apiKey).toBe("specific-openai-key");
      expect(resolved.config.model).toBe("gpt-4o-mini");
    }
  });

  it("resolve a configuração por provedor específico quando não há preferredModel", () => {
    delete process.env.MODEL_API_KEY;
    process.env.MODEL_PROVIDER = "gemini";
    process.env.MODEL_NAME = "gemini-3.1-flash-lite";
    process.env.GEMINI_API_KEY = "specific-gemini-key";

    const resolved = resolveConfiguredCloudModelConfig();

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.apiKey).toBe("specific-gemini-key");
      expect(resolved.config.provider).toBe("gemini");
      expect(resolved.config.model).toBe("gemini-3.1-flash-lite");
    }
  });

  it("falha cedo e sem configuração parcial quando não há chave", () => {
    delete process.env.MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const resolved = resolveConfiguredCloudModelConfig();

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.missingEnv).toBe("MODEL_API_KEY");
  });

  it("formatModelLabel não duplica prefixo quando o model id já contém '/'", () => {
    expect(formatModelLabel("openai", "openai/gpt-oss-120b")).toBe("openai/gpt-oss-120b");
    expect(formatModelLabel("openai", "gpt-4o-mini")).toBe("openai/gpt-4o-mini");
    expect(formatModelLabel(null, "gpt-4o-mini")).toBe("gpt-4o-mini");
  });
});
