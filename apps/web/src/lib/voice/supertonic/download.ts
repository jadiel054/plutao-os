/**
 * Download + storage dos assets Supertonic (zero binário no repo).
 *
 * - Canary: duration_predictor primeiro
 * - Arquivos grandes: HTTP Range em chunks de 24 MB + retry 3×
 * - Progresso parcial em IndexedDB (retomada ao voltar pro app)
 * - Storage final: Cache API → fallback IDB assets
 * - Erro real: arquivo, status, phase, message
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

const IDB_NAME = "plutao-supertonic-idb-v3";
const IDB_STORE_ASSETS = "assets";
const IDB_STORE_PARTIAL = "partial";

/** 24 MB — meio da faixa 16–32 MB pedida. */
const CHUNK_SIZE = 24 * 1024 * 1024;
const CHUNK_RETRIES = 3;
/** Arquivos acima deste tamanho usam Range obrigatoriamente. */
const RANGE_THRESHOLD = 8 * 1024 * 1024;

type PartialRecord = {
  url: string;
  totalBytes: number;
  receivedBytes: number;
  /** Chunks já baixados como ArrayBuffer, indexados por offset. */
  chunks: Record<string, ArrayBuffer>;
  updatedAt: number;
};

function orderedRelPaths(): string[] {
  const preferred = [
    "onnx/duration_predictor.onnx",
    "onnx/tts.json",
    "onnx/unicode_indexer.json",
    "onnx/text_encoder.onnx",
    "onnx/vocoder.onnx",
    "onnx/vector_estimator.onnx",
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
  if (e instanceof SupertonicDownloadError) return `${e.phase}: ${e.message}`;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ── IndexedDB ─────────────────────────────────────────────── */

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
      if (!db.objectStoreNames.contains(IDB_STORE_ASSETS)) {
        db.createObjectStore(IDB_STORE_ASSETS);
      }
      if (!db.objectStoreNames.contains(IDB_STORE_PARTIAL)) {
        db.createObjectStore(IDB_STORE_PARTIAL);
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

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  try {
    const db = await openIdb();
    try {
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function idbPutValue(store: string, key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new SupertonicDownloadError({
            message: `IDB put failed: ${tx.error?.message ?? "unknown"}`,
            url: key,
            phase: "idbPut",
            cause: tx.error,
          })
        );
      tx.objectStore(store).put(value, key);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(store: string, key: string): Promise<void> {
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(store).delete(key);
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

async function idbClearStore(store: string): Promise<void> {
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(store).clear();
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

async function idbPutAsset(url: string, blob: Blob): Promise<void> {
  await idbPutValue(IDB_STORE_ASSETS, url, blob);
}

async function idbGetAsset(url: string): Promise<Blob | null> {
  return idbGet<Blob>(IDB_STORE_ASSETS, url);
}

async function savePartial(rec: PartialRecord): Promise<void> {
  await idbPutValue(IDB_STORE_PARTIAL, rec.url, rec);
}

async function loadPartial(url: string): Promise<PartialRecord | null> {
  return idbGet<PartialRecord>(IDB_STORE_PARTIAL, url);
}

async function clearPartial(url: string): Promise<void> {
  await idbDelete(IDB_STORE_PARTIAL, url);
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

async function cachePutBlob(url: string, blob: Blob, contentType?: string): Promise<void> {
  const cache = await openCache();
  await cache.put(
    url,
    new Response(blob, {
      headers: { "Content-Type": contentType || "application/octet-stream" },
    })
  );
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

/* ── HTTP helpers ──────────────────────────────────────────── */

async function headContentLength(url: string): Promise<{ length: number; acceptRanges: boolean }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new SupertonicDownloadError({
        message: `HEAD HTTP ${res.status}`,
        url,
        phase: "head",
        status: res.status,
      });
    }
    const len = Number(res.headers.get("Content-Length") || 0);
    const ar = (res.headers.get("Accept-Ranges") || "").toLowerCase().includes("bytes");
    return { length: len, acceptRanges: ar };
  } catch (e) {
    if (e instanceof SupertonicDownloadError) throw e;
    // Alguns CDNs bloqueiam HEAD — tenta Range 0-0
    try {
      const res = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { Range: "bytes=0-0" },
      });
      const cr = res.headers.get("Content-Range");
      // bytes 0-0/TOTAL
      const m = cr?.match(/\/(\d+)$/);
      const total = m ? Number(m[1]) : 0;
      return { length: total, acceptRanges: res.status === 206 || Boolean(cr) };
    } catch (e2) {
      throw new SupertonicDownloadError({
        message: `HEAD/probe falhou: ${errDetail(e2)}`,
        url,
        phase: "head",
        cause: e2,
      });
    }
  }
}

async function fetchRangeChunk(
  url: string,
  start: number,
  end: number
): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { Range: `bytes=${start}-${end}` },
      });
      if (res.status !== 206 && res.status !== 200) {
        throw new SupertonicDownloadError({
          message: `Range HTTP ${res.status} (bytes ${start}-${end})`,
          url,
          phase: "range",
          status: res.status,
        });
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) {
        throw new SupertonicDownloadError({
          message: `chunk vazio (bytes ${start}-${end})`,
          url,
          phase: "range",
        });
      }
      return buf;
    } catch (e) {
      lastErr = e;
      console.warn("[voice][supertonic] chunk retry", {
        url: fileLabel(url),
        start,
        end,
        attempt,
        error: e,
      });
      if (attempt < CHUNK_RETRIES) {
        await sleep(400 * attempt * attempt); // backoff 400, 1600, 3600
      }
    }
  }
  throw new SupertonicDownloadError({
    message: `chunk falhou após ${CHUNK_RETRIES} tentativas: ${errDetail(lastErr)}`,
    url,
    phase: "range",
    cause: lastErr,
  });
}

async function fetchFullWithRetry(url: string): Promise<Blob> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new SupertonicDownloadError({
          message: `HTTP ${res.status}`,
          url,
          phase: "fetch",
          status: res.status,
        });
      }
      return await res.blob();
    } catch (e) {
      lastErr = e;
      console.warn("[voice][supertonic] full fetch retry", {
        url: fileLabel(url),
        attempt,
        error: e,
      });
      if (attempt < CHUNK_RETRIES) await sleep(400 * attempt * attempt);
    }
  }
  throw new SupertonicDownloadError({
    message: `fetch completo falhou após ${CHUNK_RETRIES}x: ${errDetail(lastErr)}`,
    url,
    phase: "fetch",
    cause: lastErr,
  });
}

function assembleChunks(partial: PartialRecord): Blob {
  const offsets = Object.keys(partial.chunks)
    .map(Number)
    .sort((a, b) => a - b);
  const parts: BlobPart[] = [];
  let expected = 0;
  for (const off of offsets) {
    if (off !== expected) {
      throw new SupertonicDownloadError({
        message: `gap no partial em offset ${expected} (tem ${off})`,
        url: partial.url,
        phase: "assemble",
      });
    }
    const buf = partial.chunks[String(off)]!;
    parts.push(buf);
    expected += buf.byteLength;
  }
  if (partial.totalBytes > 0 && expected !== partial.totalBytes) {
    throw new SupertonicDownloadError({
      message: `assemble incompleto ${expected}/${partial.totalBytes}`,
      url: partial.url,
      phase: "assemble",
    });
  }
  return new Blob(parts, { type: "application/octet-stream" });
}

async function storeFinal(url: string, blob: Blob): Promise<"cache" | "idb"> {
  try {
    await cachePutBlob(url, blob);
    return "cache";
  } catch (cacheErr) {
    console.warn("[voice][supertonic] Cache API put failed → IDB", {
      url: fileLabel(url),
      error: cacheErr,
    });
  }
  try {
    await idbPutAsset(url, blob);
    return "idb";
  } catch (idbErr) {
    throw new SupertonicDownloadError({
      message: `Cache e IndexedDB falharam: ${errDetail(idbErr)}`,
      url,
      phase: "store",
      cause: idbErr,
    });
  }
}

/**
 * Download de um arquivo com Range + retomada.
 */
async function downloadOneChunked(
  url: string,
  index: number,
  totalFiles: number,
  onProgress?: (p: DownloadProgress) => void
): Promise<"cache" | "idb"> {
  const label = fileLabel(url);
  const prefix = `arquivo ${index}/${totalFiles}`;

  if (await cacheHas(url)) {
    onProgress?.({
      pct: Math.round((index / totalFiles) * 100),
      detail: `${prefix} cache hit · ${label}`,
      storage: "cache",
    });
    return "cache";
  }
  if (await idbGetAsset(url)) {
    onProgress?.({
      pct: Math.round((index / totalFiles) * 100),
      detail: `${prefix} idb hit · ${label}`,
      storage: "idb",
    });
    return "idb";
  }

  const { length, acceptRanges } = await headContentLength(url);
  const useRange = acceptRanges && length > RANGE_THRESHOLD;

  if (!useRange) {
    onProgress?.({
      pct: Math.round(((index - 1) / totalFiles) * 100),
      detail: `${prefix} fetch simples · ${label}`,
    });
    const blob = await fetchFullWithRetry(url);
    const storage = await storeFinal(url, blob);
    await clearPartial(url);
    onProgress?.({
      pct: Math.round((index / totalFiles) * 100),
      detail: `${prefix} salvo (${storage}) · ${label}`,
      storage,
    });
    return storage;
  }

  // Resume parcial
  let partial = await loadPartial(url);
  if (partial && partial.totalBytes !== length) {
    console.info("[voice][supertonic] partial size mismatch, reset", {
      label,
      had: partial.totalBytes,
      now: length,
    });
    await clearPartial(url);
    partial = null;
  }
  if (!partial) {
    partial = {
      url,
      totalBytes: length,
      receivedBytes: 0,
      chunks: {},
      updatedAt: Date.now(),
    };
  }

  // Recomputa received a partir dos chunks (fonte da verdade)
  let received = 0;
  for (const buf of Object.values(partial.chunks)) {
    received += buf.byteLength;
  }
  partial.receivedBytes = received;

  if (received > 0) {
    onProgress?.({
      pct: filePct(index, totalFiles, received, length),
      detail: `${prefix} retomando ${label} · ${fmtMb(received)}/${fmtMb(length)} MB`,
    });
    console.info("[voice][supertonic] resume", { label, received, length });
  }

  while (received < length) {
    const start = received;
    const end = Math.min(received + CHUNK_SIZE, length) - 1;
    onProgress?.({
      pct: filePct(index, totalFiles, received, length),
      detail: `${prefix} ${label} · chunk ${fmtMb(start)}–${fmtMb(end + 1)} / ${fmtMb(length)} MB`,
    });

    const buf = await fetchRangeChunk(url, start, end);
    partial.chunks[String(start)] = buf;
    received += buf.byteLength;
    partial.receivedBytes = received;
    partial.updatedAt = Date.now();

    // Persiste após cada chunk (retomada)
    await savePartial(partial);

    onProgress?.({
      pct: filePct(index, totalFiles, received, length),
      detail: `${prefix} ${label} · ${fmtMb(received)}/${fmtMb(length)} MB`,
    });
  }

  const blob = assembleChunks(partial);
  const storage = await storeFinal(url, blob);
  await clearPartial(url);

  onProgress?.({
    pct: Math.round((index / totalFiles) * 100),
    detail: `${prefix} salvo (${storage}) · ${label}`,
    storage,
  });
  return storage;
}

function fmtMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Progresso global ponderando o arquivo atual. */
function filePct(index: number, totalFiles: number, received: number, length: number): number {
  const base = ((index - 1) / totalFiles) * 100;
  const span = 100 / totalFiles;
  const frac = length > 0 ? received / length : 0;
  return Math.min(99, Math.round(base + span * frac));
}

/* ── Public API ────────────────────────────────────────────── */

export async function isSupertonicCached(): Promise<boolean> {
  const urls = packUrls();
  for (const url of urls) {
    const ok = (await cacheHas(url)) || Boolean(await idbGetAsset(url));
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
  await idbClearStore(IDB_STORE_ASSETS);
  await idbClearStore(IDB_STORE_PARTIAL);
}

/** Há download parcial pendente? */
export async function hasPartialDownload(): Promise<boolean> {
  try {
    const db = await openIdb();
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_PARTIAL, "readonly");
        const req = tx.objectStore(IDB_STORE_PARTIAL).count();
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

let activeDownload: Promise<void> | null = null;

/**
 * Download sequencial com canary + Range + retomada.
 * Chamadas concorrentes compartilham a mesma Promise.
 */
export async function downloadSupertonicPack(
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  if (activeDownload) {
    await activeDownload;
    return;
  }

  activeDownload = (async () => {
    const urls = packUrls();
    const total = urls.length;
    let usedIdb = false;

    onProgress?.({ pct: 0, detail: `canary 1/${total} · ${fileLabel(urls[0]!)}` });
    const canaryStorage = await downloadOneChunked(urls[0]!, 1, total, onProgress);
    if (canaryStorage === "idb") usedIdb = true;
    console.info("[voice][supertonic] canary OK", {
      file: fileLabel(urls[0]!),
      storage: canaryStorage,
    });

    for (let i = 1; i < urls.length; i++) {
      const storage = await downloadOneChunked(urls[i]!, i + 1, total, onProgress);
      if (storage === "idb") usedIdb = true;
    }

    onProgress?.({
      pct: 100,
      detail: usedIdb
        ? "Pronto (storage: IndexedDB)"
        : "Pronto (storage: Cache API)",
      storage: usedIdb ? "idb" : "cache",
    });
  })();

  try {
    await activeDownload;
  } finally {
    activeDownload = null;
  }
}

export async function resolveAssetUrl(relOrAbs: string): Promise<string> {
  const url = relOrAbs.startsWith("http") ? relOrAbs : hfUrl(relOrAbs);

  const fromCache = await cacheGetBlob(url);
  if (fromCache) return URL.createObjectURL(fromCache);

  const fromIdb = await idbGetAsset(url);
  if (fromIdb) return URL.createObjectURL(fromIdb);

  return url;
}
