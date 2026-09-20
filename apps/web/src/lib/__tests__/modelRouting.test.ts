import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PRESET_MODELS } from "@plutao/domain";
import { buildImageParts, VISION_CAPABLE_PROVIDERS } from "../runtime/model/imageParts";
import { resolveCloudModelConfig, getCloudRoute } from "../runtime/model/resolveConfig";
import { getModelConfig } from "../runtime/model/config";

describe("Model Routing & Preset Registry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });
  it("inclui Gemini 3.1 Flash-Lite na lista de modelos predefinidos", () => {
    const gemini = PRESET_MODELS.find((m) => m.id === "gemini/gemini-3.1-flash-lite");
    expect(gemini).toBeDefined();
    expect(gemini?.providerName).toBe("Google AI Studio");
    expect(gemini?.category).toBe("vision");
  });

  it("buildImageParts constrói partes de imagem preferindo blobUrl sobre dataUrl", () => {
    const artifacts = [
      {
        id: "art-1",
        name: "foto.jpg",
        type: "image/jpeg",
        size: 1024,
        metadata: {
          isImage: true,
          blobUrl: "https://blob.store/foto.jpg",
          dataUrl: "data:image/jpeg;base64,12345",
        },
      },
    ];

    const parts = buildImageParts(artifacts);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      type: "image_url",
      image_url: { url: "https://blob.store/foto.jpg" },
    });
  });

  it("buildImageParts usa dataUrl como fallback quando blobUrl não existe", () => {
    const artifacts = [
      {
        id: "art-2",
        name: "print.png",
        type: "image/png",
        size: 2048,
        metadata: {
          isImage: true,
          dataUrl: "data:image/png;base64,67890",
        },
      },
    ];

    const parts = buildImageParts(artifacts);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,67890" },
    });
  });

  it("buildImageParts retorna array vazio para não-imagens (PDF, Excel, Texto)", () => {
    const artifacts = [
      {
        id: "art-3",
        name: "documento.pdf",
        type: "application/pdf",
        size: 5000,
        metadata: { isBinary: true },
      },
      {
        id: "art-4",
        name: "dados.csv",
        type: "text/csv",
        size: 500,
        metadata: {},
      },
    ];

    const parts = buildImageParts(artifacts);
    expect(parts).toEqual([]);
  });

  it("VISION_CAPABLE_PROVIDERS contém gemini e openai", () => {
    expect(VISION_CAPABLE_PROVIDERS).toContain("gemini");
    expect(VISION_CAPABLE_PROVIDERS).toContain("openai");
    expect(VISION_CAPABLE_PROVIDERS).not.toContain("xai");
    expect(VISION_CAPABLE_PROVIDERS).not.toContain("local");
  });

  it("mapeia modelos Gemini para os apiModels corretos gemini-3.1-flash-lite e gemini-3.1-pro", () => {
    const flashLiteRoute = getCloudRoute("gemini/gemini-3.1-flash-lite");
    expect(flashLiteRoute).toBeDefined();
    expect(flashLiteRoute?.apiModel).toBe("gemini-3.1-flash-lite");
    expect(flashLiteRoute?.provider).toBe("gemini");

    const proRoute = getCloudRoute("gemini/gemini-3.1-pro");
    expect(proRoute).toBeDefined();
    expect(proRoute?.apiModel).toBe("gemini-3.1-pro");
    expect(proRoute?.provider).toBe("gemini");
  });

  it("resolveCloudModelConfig retorna config correta para Gemini quando GEMINI_API_KEY está definida", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const resolvedFlash = resolveCloudModelConfig("gemini/gemini-3.1-flash-lite");
    expect(resolvedFlash.ok).toBe(true);
    if (resolvedFlash.ok) {
      expect(resolvedFlash.config.model).toBe("gemini-3.1-flash-lite");
      expect(resolvedFlash.config.provider).toBe("gemini");
      expect(resolvedFlash.config.apiKey).toBe("test-gemini-key");
    }

    const resolvedPro = resolveCloudModelConfig("gemini/gemini-3.1-pro");
    expect(resolvedPro.ok).toBe(true);
    if (resolvedPro.ok) {
      expect(resolvedPro.config.model).toBe("gemini-3.1-pro");
      expect(resolvedPro.config.provider).toBe("gemini");
      expect(resolvedPro.config.apiKey).toBe("test-gemini-key");
    }
  });

  it("getModelConfig retorna gemini-3.1-flash-lite como padrão para o provedor gemini", () => {
    process.env.MODEL_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.MODEL_NAME;

    const config = getModelConfig();
    expect(config).not.toBeNull();
    expect(config?.provider).toBe("gemini");
    expect(config?.model).toBe("gemini-3.1-flash-lite");
  });
});
