import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveCloudModelConfig } from "../resolveConfig";
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

  it("formatModelLabel não duplica prefixo quando o model id já contém '/'", () => {
    expect(formatModelLabel("openai", "openai/gpt-oss-120b")).toBe("openai/gpt-oss-120b");
    expect(formatModelLabel("openai", "gpt-4o-mini")).toBe("openai/gpt-4o-mini");
    expect(formatModelLabel(null, "gpt-4o-mini")).toBe("gpt-4o-mini");
  });
});
