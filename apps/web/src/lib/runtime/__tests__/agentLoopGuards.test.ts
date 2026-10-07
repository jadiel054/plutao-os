import { describe, expect, it } from "vitest";
import {
  MAX_TOTAL_ITERATIONS,
  MAX_TOTAL_TOKENS,
  modelUsageTokens,
} from "../agent-loop";
import type { ModelStepResult } from "../model/types";

function result(usage?: ModelStepResult["usage"]): ModelStepResult {
  return {
    provider: "openai",
    model: "test-model",
    content: "ok",
    toolProposal: null,
    usage,
    latencyMs: 1,
  };
}

describe("Agent loop budgets", () => {
  it("mantém teto acumulado de iterações e tokens", () => {
    expect(MAX_TOTAL_ITERATIONS).toBe(60);
    expect(MAX_TOTAL_TOKENS).toBe(120_000);
  });

  it("soma prompt e completion tokens reportados", () => {
    expect(modelUsageTokens(result({ promptTokens: 120, completionTokens: 30 }))).toBe(150);
  });

  it("ignora usage ausente, negativo, infinito ou não numérico", () => {
    expect(modelUsageTokens(result())).toBe(0);
    expect(modelUsageTokens(result({ promptTokens: -4, completionTokens: Number.POSITIVE_INFINITY }))).toBe(0);
    expect(modelUsageTokens(result({ promptTokens: Number.NaN, completionTokens: 12.9 }))).toBe(12);
  });
});
