import type { ModelProviderId, MultimodalContentPart } from "./types";
import { get } from "@vercel/blob";

export const VISION_CAPABLE_PROVIDERS: ModelProviderId[] = ["gemini", "openai"];

export type ArtifactItemForVision = {
  id: string;
  name: string;
  type: string;
  size: number;
  metadata?: Record<string, unknown> | null;
};

/**
 * Monta partes de imagem para providers com visão. Blobs privados são lidos
 * server-side e convertidos em data URL transitória; dataUrl é apenas fallback
 * para artifacts legados e não deve ser persistido em novos uploads.
 */
export async function buildImageParts(artifacts: ArtifactItemForVision[]): Promise<MultimodalContentPart[]> {
  const imageParts: MultimodalContentPart[] = [];

  for (const a of artifacts) {
    const meta = a.metadata || {};
    const isImage = Boolean(meta.isImage) || (a.type && a.type.startsWith("image/"));
    if (isImage) {
      let url = (meta.dataUrl as string) || undefined;
      const blobUrl = meta.blobUrl as string | undefined;
      if (blobUrl) {
        try {
          const blob = await get(blobUrl, { access: "private" });
          if (blob?.statusCode === 200) {
            const bytes = await new Response(blob.stream).arrayBuffer();
            const contentType = blob.headers.get("content-type") || a.type || "image/png";
            url = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
          }
        } catch {
          // A legacy artifact may be public or have an unavailable blob;
          // fall back to its old data URL when one exists.
        }
      }
      if (url) {
        imageParts.push({ type: "image_url", image_url: { url } });
      }
    }
  }

  return imageParts;
}
