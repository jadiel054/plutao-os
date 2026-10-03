import { describe, it, expect } from "vitest";
import { callModelWithRetry } from "../modelCall";
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
    expect(p.sleepCalls).toEqual([800]);
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
});
