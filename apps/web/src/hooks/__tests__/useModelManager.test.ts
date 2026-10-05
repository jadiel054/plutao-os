import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIModel } from "@plutao/domain";
import { startDownloadAction } from "../useModelManager";

describe("useModelManager — startDownload sem simulação de timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prova que startDownloadAction NÃO cria timer (setInterval não é chamado)", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    let progressesState: Record<string, unknown> = {};
    const setProgresses = (updater: unknown) => {
      progressesState = typeof updater === "function"
        ? (updater as (prev: Record<string, unknown>) => Record<string, unknown>)(progressesState)
        : (updater as Record<string, unknown>);
    };

    const dummyModel: AIModel = {
      id: "test/local-model",
      name: "Test Local Model",
      providerType: "local",
      providerName: "Test Provider",
      category: "text",
      description: "Test description",
      parameters: "1B",
      sizeBytes: 1000000,
      sizeLabel: "1 MB",
      hardware: "cpu",
      speedRating: 5,
      license: "MIT",
      comingSoon: false,
    };

    startDownloadAction(dummyModel, setProgresses);

    // 1. Prova que setInterval NUNCA foi chamado no startDownloadAction da lógica real
    expect(setIntervalSpy).not.toHaveBeenCalled();

    // 2. Avança o tempo em 10 segundos
    vi.advanceTimersByTime(10000);

    // 3. Prova que a contagem de timers ativos continua 0
    expect(vi.getTimerCount()).toBe(0);
    expect(progressesState["test/local-model"]).toEqual({
      modelId: "test/local-model",
      status: "downloading",
      progress: 0,
      loadedBytes: 0,
      totalBytes: 1000000,
      speedMBs: 0,
    });
  });

  it("se a simulação de timer estivesse presente no startDownload, a asserção de ausência de timer FALHARIA", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    // Contra-prova: se a simulação com timer estivesse presente
    function legacySimulatedStartDownload(_model: AIModel) {
      setInterval(() => {}, 200);
    }

    const dummyModel: AIModel = {
      id: "test/local-model",
      name: "Test Local Model",
      providerType: "local",
      providerName: "Test Provider",
      category: "text",
      description: "Test description",
      parameters: "1B",
      sizeBytes: 1000000,
      sizeLabel: "1 MB",
      hardware: "cpu",
      speedRating: 5,
      license: "MIT",
    };

    legacySimulatedStartDownload(dummyModel);

    // Captura com precisão a presença de timer
    expect(setIntervalSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("startDownloadAction ignora modelos com comingSoon: true", () => {
    let progressesState: Record<string, unknown> = {};
    const setProgresses = (updater: unknown) => {
      progressesState = typeof updater === "function"
        ? (updater as (prev: Record<string, unknown>) => Record<string, unknown>)(progressesState)
        : (updater as Record<string, unknown>);
    };

    const comingSoonModel: AIModel = {
      id: "Xenova/Llama-3.2-3B-Instruct-q4",
      name: "Llama 3.2 3B Instruct (q4)",
      providerType: "local",
      providerName: "Hugging Face / WebGPU",
      category: "text",
      description: "Desc",
      parameters: "3.2B",
      sizeBytes: 1950000000,
      sizeLabel: "1.95 GB",
      hardware: "webgpu",
      speedRating: 4,
      license: "Llama 3.2 Community",
      comingSoon: true,
    };

    startDownloadAction(comingSoonModel, setProgresses);

    expect(progressesState[comingSoonModel.id]).toBeUndefined();
  });
});
