/**
 * Download + Cache API dos assets Supertonic (zero binário no repo).
 */

import {
  hfUrl,
  SUPERTONIC_CACHE,
  SUPERTONIC_ONNX_FILES,
  SUPERTONIC_VOICE_IDS,
  voiceStyleRel,
} from "./assets";

export type DownloadProgress = {
  pct: number;
  detail: string;
};

async function openCache(): Promise<Cache> {
  return caches.open(SUPERTONIC_CACHE);
}

/** Lista de URLs obrigatórias do pack. */
export function packUrls(): string[] {
  const onnx = SUPERTONIC_ONNX_FILES.map((p) => hfUrl(p));
  const styles = SUPERTONIC_VOICE_IDS.map((id) => hfUrl(voiceStyleRel(id)));
  return [...onnx, ...styles];
}

export async function isSupertonicCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await openCache();
    const urls = packUrls();
    const results = await Promise.all(urls.map((u) => cache.match(u)));
    return results.every(Boolean);
  } catch {
    return false;
  }
}

export async function clearSupertonicCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(SUPERTONIC_CACHE);
  } catch {
    /* ignore */
  }
}

/**
 * Baixa todos os arquivos do pack para Cache API.
 * Retorna map url → Response blob URL útil para ort (via cache.match).
 */
export async function downloadSupertonicPack(
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const cache = await openCache();
  const urls = packUrls();
  let done = 0;
  const total = urls.length;

  for (const url of urls) {
    const existing = await cache.match(url);
    if (existing) {
      done += 1;
      onProgress?.({
        pct: Math.round((done / total) * 100),
        detail: `cache hit ${done}/${total}`,
      });
      continue;
    }
    onProgress?.({
      pct: Math.round((done / total) * 100),
      detail: `baixando ${url.split("/").pop() ?? "asset"}…`,
    });
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Falha ao baixar Supertonic: ${url} (${res.status})`);
    }
    // Clone before putting — body can only be consumed once
    await cache.put(url, res.clone());
    done += 1;
    onProgress?.({
      pct: Math.round((done / total) * 100),
      detail: `salvo ${done}/${total}`,
    });
  }
}

/** Resolve URL (possivelmente blob:) a partir do cache; fallback fetch. */
export async function resolveAssetUrl(relOrAbs: string): Promise<string> {
  const url = relOrAbs.startsWith("http") ? relOrAbs : hfUrl(relOrAbs);
  if (typeof caches !== "undefined") {
    try {
      const cache = await openCache();
      const hit = await cache.match(url);
      if (hit) {
        const blob = await hit.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      /* fall through */
    }
  }
  return url;
}
