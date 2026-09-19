import { describe, it, expect } from "vitest";
import { PRESET_MODELS } from "@plutao/domain";
import { buildImageParts, VISION_CAPABLE_PROVIDERS } from "../runtime/model/imageParts";

describe("Model Routing & Preset Registry", () => {
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
});
