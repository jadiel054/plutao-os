import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock do Transformers.js: o pipeline do modelo PRIMÁRIO falha;
// o FALLBACK carrega e gera resposta.
const loadedModels: string[] = [];

vi.mock("@huggingface/transformers", () => ({
  pipeline: async (_task: string, modelId: string) => {
    if (modelId.includes("Llama-3.2")) {
      throw new Error("simulated primary load failure");
    }
    loadedModels.push(modelId);
    return async (_prompt: string) => [{ generated_text: "local fallback answer" }];
  },
}));

import { LocalProvider, FALLBACK_LOCAL_MODEL_ID } from "./localProvider";

describe("LocalProvider.loadPipeline", () => {
  beforeEach(() => {
    loadedModels.length = 0;
    vi.stubGlobal("window", { navigator: {} });
  });

  it("cai para o modelo alternativo quando o primário falha e gera resposta", async () => {
    const provider = new LocalProvider({ modelId: "Xenova/Llama-3.2-3B-Instruct-q4", device: "cpu" });
    const result = await provider.callModel([{ role: "user", content: "olá" }]);
    expect(result.ok).toBe(true);
    expect(result.output).toBe("local fallback answer");
    expect(provider.getModelId()).toBe(FALLBACK_LOCAL_MODEL_ID);
    expect(loadedModels).toEqual([FALLBACK_LOCAL_MODEL_ID]);
  });

  it("carregamentos concorrentes compartilham a mesma promise (sem ciclo)", async () => {
    const provider = new LocalProvider({ modelId: "Xenova/Llama-3.2-3B-Instruct-q4", device: "cpu" });
    const [a, b] = await Promise.all([
      provider.callModel([{ role: "user", content: "a" }]),
      provider.callModel([{ role: "user", content: "b" }]),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Fallback carregado exatamente UMA vez (dedupe por promise compartilhada).
    expect(loadedModels).toHaveLength(1);
  });
});
