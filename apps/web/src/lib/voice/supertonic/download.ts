/**
 * Download + storage dos assets Supertonic (zero binário no repo).
 *
 * Ordem: canary (duration_predictor) → demais ONNX/JSON → voice styles.
 * Storage: Cache API; fallback IndexedDB se cache.put falhar (quota mobile).
 * Nunca engole o erro real — inclui arquivo, status HTTP e message.
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
  storage?: "cache" | "idb";
};

const IDB_NAME = "plutao-supertonic-idb-v2";
const IDB_STORE = "assets";

/** Ordem estável: canary pequeno primeiro, maiores por último. */
function orderedRelPaths(): string[] {
  const preferred = [
    "onnx/duration_predictor.onnx", // canary ~3.7 MB
    "onnx/tts.json",
    "onnx/unicode_indexer.json",
    "onnx/text_encoder.onnx",
    "onnx/vocoder.onnx",
    "onnx/vector_estimator.onnx", // ~257 MB
  ];
  const rest = SUPERTONIC_ONNX_FILES.filter((p) => !preferred.includes(p));
  const styles = SUPERTONIC_VOICE_IDS.map((id) => voiceStyleRel(id));
  return [...preferred, ...rest, ...styles];
}

export function packUrls(): string[] {
  return orderedRelPaths().map((p) => hfUrl(p));
}

function fileLabel(url: string): string {
  try {
    const parts = url.split("/");
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

export class SupertonicDownloadError extends Error {
  readonly url: string;
  readonly file: string;
  readonly status?: number;
  readonly phase: string;

  constructor(opts: {
    message: string;
    url: string;
    phase: string;
    status?: number;
    cause?: unknown;
  }) {
    const file = fileLabel(opts.url);
    const statusPart = opts.status != null ? ` HTTP ${opts.status}` : "";
    super(`${opts.message} [${file}${statusPart}]`);
    this.name = "SupertonicDownloadError";
    this.url = opts.url;
    this.file = file;
    this.status = opts.status;
    this.phase = opts.phase;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

function errDetail(e: unknown): string {
  if (e instanceof SupertonicDownloadError) {
    return `${e.phase}: ${e.message}`;
  }
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

/* ── Cache API ─────────────────────────────────────────────── */

async function openCache(): Promise<Cache> {
  if (typeof caches === "undefined") {
    throw new SupertonicDownloadError({
      message: "Cache API indisponível neste ambiente",
      url: "",
      phase: "openCache",
    });
  }
  return caches.open(SUPERTONIC_CACHE);
}

async function cacheHas(url: string): Promise<boolean> {
  try {
    const cache = await openCache();
    return Boolean(await cache.match(url));
  } catch {
    return false;
  }
}

async function cachePut(url: string, res: Response): Promise<void> {
  const cache = await openCache();
  await cache.put(url, res);
}

async function cacheGetBlob(url: string): Promise<Blob | null> {
  try {
    const cache = await openCache();
    const hit = await cache.match(url);
    if (!hit) return null;
    return hit.blob();
  } catch {
    return null;
  }
}

/* ── IndexedDB fallback ────────────────────────────────────── */

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new SupertonicDownloadError({
          message: "IndexedDB indisponível",
          url: "",
          phase: "openIdb",
        })
      );
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(
        new SupertonicDownloadError({
          message: `IndexedDB open failed: ${req.error?.message ?? "unknown"}`,
          url: "",
          phase: "openIdb",
          cause: req.error,
        })
      );
  });
}

async function idbPut(url: string, blob: Blob): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new SupertonicDownloadError({
            message: `IDB put failed: ${tx.error?.message ?? "unknown"}`,
            url,
            phase: "idbPut",
            cause: tx.error,
          })
        );
      tx.objectStore(IDB_STORE).put(blob, url);
    });
  } finally {
    db.close();
  }
}

async function idbGet(url: string): Promise<Blob | null> {
  try {
    const db = await openIdb();
    try {
      return await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(url);
        req.onsuccess = () => resolve((req.result as Blob) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function idbHas(url: string): Promise<boolean> {
  return Boolean(await idbGet(url));
}

async function idbClear(): Promise<void> {
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(IDB_STORE).clear();
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

/* ── Public API ────────────────────────────────────────────── */

export async function isSupertonicCached(): Promise<boolean> {
  const urls = packUrls();
  for (const url of urls) {
    const ok = (await cacheHas(url)) || (await idbHas(url));
    if (!ok) return false;
  }
  return true;
}

export async function clearSupertonicCache(): Promise<void> {
  if (typeof caches !== "undefined") {
    try {
      await caches.delete(SUPERTONIC_CACHE);
    } catch {
      /* ignore */
    }
  }
  await idbClear();
}

/**
 * Baixa um único arquivo: fetch → Cache API; se put falhar → IndexedDB.
 */
async function downloadOne(
  url: string,
  index: number,
  total: number,
  onProgress?: (p: DownloadProgress) => void
): Promise<"cache" | "idb"> {
  const label = fileLabel(url);
  const prefix = `arquivo ${index}/${total}`;

  if (await cacheHas(url)) {
    onProgress?.({ pct: Math.round((index / total) * 100), detail: `${prefix} cache hit · ${label}`, storage: "cache" });
    return "cache";
  }
  if (await idbHas(url)) {
    onProgress?.({ pct: Math.round((index / total) * 100), detail: `${prefix} idb hit · ${label}`, storage: "idb" });
    return "idb";
  }

  onProgress?.({
    pct: Math.round(((index - 1) / total) * 100),
    detail: `${prefix} baixando ${label}…`,
  });

  let res: Response;
  try {
    res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
  } catch (e) {
    console.error("[voice][supertonic] fetch failed", { url, error: e });
    throw new SupertonicDownloadError({
      message: `fetch falhou: ${errDetail(e)}`,
      url,
      phase: "fetch",
      cause: e,
    });
  }

  if (!res.ok) {
    console.error("[voice][supertonic] HTTP error", { url, status: res.status, statusText: res.statusText });
    throw new SupertonicDownloadError({
      message: `HTTP ${res.status} ${res.statusText || ""}`.trim(),
      url,
      phase: "fetch",
      status: res.status,
    });
  }

  // Materializa body uma vez (mobile: evita re-stream no put)
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch (e) {
    console.error("[voice][supertonic] blob() failed", { url, error: e });
    throw new SupertonicDownloadError({
      message: `leitura do body falhou: ${errDetail(e)}`,
      url,
      phase: "blob",
      cause: e,
    });
  }

  // 1) Cache API
  try {
    await cachePut(url, new Response(blob, { headers: { "Content-Type": res.headers.get("Content-Type") || "application/octet-stream" } }));
    onProgress?.({
      pct: Math.round((index / total) * 100),
      detail: `${prefix} salvo (Cache API) · ${label}`,
      storage: "cache",
    });
    return "cache";
  } catch (cacheErr) {
    console.warn("[voice][supertonic] Cache API put failed, trying IndexedDB", {
      url,
      error: cacheErr,
    });
  }

  // 2) IndexedDB fallback
  try {
    await idbPut(url, blob);
    onProgress?.({
      pct: Math.round((index / total) * 100),
      detail: `${prefix} salvo (IndexedDB) · ${label}`,
      storage: "idb",
    });
    return "idb";
  } catch (idbErr) {
    console.error("[voice][supertonic] IDB put failed", { url, error: idbErr });
    throw new SupertonicDownloadError({
      message: `Cache e IndexedDB falharam: ${errDetail(idbErr)}`,
      url,
      phase: "store",
      cause: idbErr,
    });
  }
}

/**
 * Download sequencial com canary (1º arquivo = duration_predictor).
 */
export async function downloadSupertonicPack(
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const urls = packUrls();
  const total = urls.length;
  let usedIdb = false;

  // CANARY — index 1
  onProgress?.({ pct: 0, detail: `canary 1/${total} · ${fileLabel(urls[0]!)}` });
  const canaryStorage = await downloadOne(urls[0]!, 1, total, onProgress);
  if (canaryStorage === "idb") usedIdb = true;
  console.info("[voice][supertonic] canary OK", { file: fileLabel(urls[0]!), storage: canaryStorage });

  for (let i = 1; i < urls.length; i++) {
    const storage = await downloadOne(urls[i]!, i + 1, total, onProgress);
    if (storage === "idb") usedIdb = true;
  }

  if (usedIdb) {
    onProgress?.({ pct: 100, detail: "Pronto (storage: IndexedDB — Cache API indisponível/quota)" });
  } else {
    onProgress?.({ pct: 100, detail: "Pronto (storage: Cache API)" });
  }
}

/** Resolve blob URL a partir de Cache API ou IndexedDB; fallback = URL remota. */
export async function resolveAssetUrl(relOrAbs: string): Promise<string> {
  const url = relOrAbs.startsWith("http") ? relOrAbs : hfUrl(relOrAbs);

  const fromCache = await cacheGetBlob(url);
  if (fromCache) return URL.createObjectURL(fromCache);

  const fromIdb = await idbGet(url);
  if (fromIdb) return URL.createObjectURL(fromIdb);

  return url;
}
