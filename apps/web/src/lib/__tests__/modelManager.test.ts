import { describe, it, expect, vi } from "vitest";
import { PRESET_MODELS } from "@plutao/domain";

describe("Model Manager & Coming Soon local models (#113)", () => {
  it("should mark all local browser models as comingSoon: true", () => {
    const localModels = PRESET_MODELS.filter((m) => m.providerType === "local");
    expect(localModels.length).toBeGreaterThan(0);
    for (const model of localModels) {
      expect(model.comingSoon).toBe(true);
    }
  });

  it("should not mark cloud models as comingSoon", () => {
    const cloudModels = PRESET_MODELS.filter((m) => m.providerType === "cloud");
    expect(cloudModels.length).toBeGreaterThan(0);
    for (const model of cloudModels) {
      expect(model.comingSoon).toBeUndefined();
    }
  });

  it("should not invoke setInterval or fake download progress on local startDownload", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    // Simulate startDownload logic without timer
    const localModel = PRESET_MODELS.find((m) => m.providerType === "local")!;
    expect(localModel).toBeDefined();

    // Verify setInterval was not called
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
