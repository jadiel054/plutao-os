import { describe, it, expect, beforeEach } from "vitest";
import { getLocalProvider, resetLocalProvider, LocalProvider } from "../localProvider";

describe("LocalProvider", () => {
  beforeEach(() => {
    resetLocalProvider();
  });

  it("cria instâncias separadas por modelId e as reutiliza no cache", () => {
    const p1 = getLocalProvider({ modelId: "Xenova/Llama-3.2-3B-Instruct-q4" });
    const p2 = getLocalProvider({ modelId: "Xenova/Qwen2.5-1.5B-Instruct" });
    const p1Again = getLocalProvider({ modelId: "Xenova/Llama-3.2-3B-Instruct-q4" });

    expect(p1.getModelId()).toBe("Xenova/Llama-3.2-3B-Instruct-q4");
    expect(p2.getModelId()).toBe("Xenova/Qwen2.5-1.5B-Instruct");
    expect(p1).not.toBe(p2);
    expect(p1).toBe(p1Again);
  });

  it("resolve o pipeline de 'feature-extraction' para modelos de embedding e 'text-generation' para os demais", () => {
    const embedProvider = new LocalProvider({ modelId: "Xenova/all-MiniLM-L6-v2" });
    const textProvider = new LocalProvider({ modelId: "Xenova/Llama-3.2-3B-Instruct-q4" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embedTask = (embedProvider as any).resolvePipelineTask();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textTask = (textProvider as any).resolvePipelineTask();

    expect(embedTask).toBe("feature-extraction");
    expect(textTask).toBe("text-generation");
  });

  it("não altera silenciosamente this.modelId quando loadPipeline falha", async () => {
    const provider = new LocalProvider({ modelId: "Xenova/NonExistentModel" });

    // Simula ambiente de navegador sem window.pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).window = {
      navigator: {} as Navigator,
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (provider as any).loadPipeline();
    } catch {
      /* erro esperado */
    }

    expect(provider.getModelId()).toBe("Xenova/NonExistentModel");
    expect(provider.getStatus()).toBe("error");
    expect(provider.getLoadError()).toContain("Xenova/NonExistentModel");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).window;
  });
});
