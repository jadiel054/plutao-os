import { describe, it, expect } from "vitest";
import { callModelWithRetry, classifyModelError } from "../modelCall";
import type { ModelStepResult } from "../types";

const okResult: ModelStepResult = {
  provider: "openai",
  model: "openai/gpt-oss-120b",
  content: "ok",
  toolProposal: null,
  latencyMs: 5,
};

function makeProvider(failTimes: number) {
  let calls = 0;
  const sleepCalls: number[] = [];
  return {
    sleepCalls,
    provider: {
      callModel: async () => {
        calls++;
        if (calls <= failTimes) throw new Error("HTTP 500");
        return okResult;
      },
      getProviderType: () => "groq" as const,
      getModelId: () => "openai/gpt-oss-120b",
    },
    calls: () => calls,
  };
}

describe("callModelWithRetry — resiliência do runtime de missões", () => {
  it("classifica rate limit sem expor a mensagem do provedor", () => {
    const failure = classifyModelError(new Error("429 Rate limit exceeded: secret=do-not-persist"), {
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
    expect(failure).toMatchObject({
      code: "MODEL_RATE_LIMITED",
      category: "RATE_LIMIT",
      retryable: true,
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
    expect(JSON.stringify(failure)).not.toContain("do-not-persist");
  });

  it("classifica credencial rejeitada como permanente e não retryable", () => {
    expect(classifyModelError(new Error("401 Unauthorized"))).toMatchObject({
      code: "MODEL_UNAUTHORIZED",
      category: "AUTH",
      retryable: false,
    });
  });

  it("tenta 2x com backoff quando a 1ª chamada falha", async () => {
    const p = makeProvider(1);
    const res = await callModelWithRetry(p.provider, [], {
      retries: 1,
      backoffMs: 800,
      sleep: async (ms) => {
        p.sleepCalls.push(ms);
      },
    });
    expect(res.attempts).toBe(2);
    expect(p.calls()).toBe(2);
    expect(p.sleepCalls.length).toBe(1);
    expect(p.sleepCalls[0]).toBeGreaterThanOrEqual(800);
    expect(p.sleepCalls[0]).toBeLessThanOrEqual(1000);
  });

  it("propaga o erro após esgotar as tentativas (1 retry + falha = FAILED)", async () => {
    const p = makeProvider(99);
    await expect(
      callModelWithRetry(p.provider, [], { retries: 1, backoffMs: 800, sleep: async () => {} })
    ).rejects.toThrow("HTTP 500");
    expect(p.calls()).toBe(2);
  });

  it("não faz retry quando a 1ª chamada tem sucesso", async () => {
    const p = makeProvider(0);
    const res = await callModelWithRetry(p.provider, [], { retries: 1, sleep: async () => {} });
    expect(res.attempts).toBe(1);
    expect(p.calls()).toBe(1);
  });

  it("honra a dica do provedor quando o erro contém 'try again in 500ms'", async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    const provider = {
      callModel: async () => {
        calls++;
        if (calls === 1) {
          throw new Error("Rate limit exceeded. Please try again in 500ms.");
        }
        return okResult;
      },
      getProviderType: () => "groq" as const,
      getModelId: () => "openai/gpt-oss-120b",
    };

    const res = await callModelWithRetry(provider, [], {
      retries: 1,
      backoffMs: 800,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    expect(res.attempts).toBe(2);
    expect(calls).toBe(2);
    // Esperado: 500ms (dica) + 800ms (base backoff) + jitter (0..200ms) => entre 1300ms e 1500ms
    expect(sleepCalls.length).toBe(1);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(1300);
    expect(sleepCalls[0]).toBeLessThanOrEqual(1500);
  });
});
