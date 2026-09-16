import { describe, it, expect } from "vitest";
import { PRESET_MODELS, filterModels, ModelFilterOptions } from "@plutao/domain";

describe("Model Registry & Filter Helper", () => {
  it("should contain preset models", () => {
    expect(PRESET_MODELS.length).toBeGreaterThan(0);
    const localModel = PRESET_MODELS.find((m) => m.id === "Xenova/Llama-3.2-3B-Instruct-q4");
    expect(localModel).toBeDefined();
    expect(localModel?.providerType).toBe("local");
  });

  it("should filter models by search query", () => {
    const options: ModelFilterOptions = {
      search: "Qwen",
      provider: "all",
      category: "all",
      status: "all",
      sortBy: "name",
    };
    const result = filterModels(PRESET_MODELS, options);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("Xenova/Qwen2.5-1.5B-Instruct");
  });

  it("should filter models by provider type", () => {
    const cloudOptions: ModelFilterOptions = {
      search: "",
      provider: "cloud",
      category: "all",
      status: "all",
      sortBy: "name",
    };
    const cloudResult = filterModels(PRESET_MODELS, cloudOptions);
    expect(cloudResult.every((m) => m.providerType === "cloud")).toBe(true);

    const localOptions: ModelFilterOptions = {
      search: "",
      provider: "local",
      category: "all",
      status: "all",
      sortBy: "name",
    };
    const localResult = filterModels(PRESET_MODELS, localOptions);
    expect(localResult.every((m) => m.providerType === "local")).toBe(true);
  });

  it("should filter models by status (downloaded vs available)", () => {
    const downloadedIds = ["Xenova/Llama-3.2-3B-Instruct-q4"];
    const options: ModelFilterOptions = {
      search: "",
      provider: "local",
      category: "all",
      status: "downloaded",
      sortBy: "name",
    };
    const result = filterModels(PRESET_MODELS, options, downloadedIds);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("Xenova/Llama-3.2-3B-Instruct-q4");
  });
});
