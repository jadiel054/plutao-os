import { describe, it, expect } from "vitest";
import { PRESET_MODELS } from "@plutao/domain";

describe("Model Routing & Preset Registry", () => {
  it("inclui Gemini 3.1 Flash-Lite na lista de modelos predefinidos", () => {
    const gemini = PRESET_MODELS.find((m) => m.id === "gemini/gemini-3.1-flash-lite");
    expect(gemini).toBeDefined();
    expect(gemini?.providerName).toBe("Google AI Studio");
    expect(gemini?.category).toBe("vision");
  });
});
