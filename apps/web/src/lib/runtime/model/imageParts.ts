import type { ModelProviderId, MultimodalContentPart } from "./types";

export const VISION_CAPABLE_PROVIDERS: ModelProviderId[] = ["gemini", "openai"];

export type ArtifactItemForVision = {
  id: string;
  name: string;
  type: string;
  size: number;
  metadata?: Record<string, unknown> | null;
};

/**
 * Monta as partes de imagem (MultimodalContentPart) para qualquer provider com capacidade de visão.
 * Prioriza metadata.blobUrl (URL curta) e usa metadata.dataUrl (base64) como fallback.
 */
export function buildImageParts(artifacts: ArtifactItemForVision[]): MultimodalContentPart[] {
  const imageParts: MultimodalContentPart[] = [];

  for (const a of artifacts) {
    const meta = a.metadata || {};
    const isImage = Boolean(meta.isImage) || (a.type && a.type.startsWith("image/"));
    if (isImage) {
      const url = (meta.blobUrl as string) || (meta.dataUrl as string) || undefined;
      if (url) {
        imageParts.push({ type: "image_url", image_url: { url } });
      }
    }
  }

  return imageParts;
}
