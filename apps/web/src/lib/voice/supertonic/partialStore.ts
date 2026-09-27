/**
 * Partial download IDB storage — one record per chunk (O(1) writes).
 * Keys: partial_meta::<url> | partial_chunk::<url>::<offset>
 * Legacy single-record schema (with .chunks) is discarded on load.
 */

export type PartialMeta = {
  url: string;
  totalBytes: number;
  receivedBytes: number;
  updatedAt: number;
};

export type PartialRecord = {
  url: string;
  totalBytes: number;
  receivedBytes: number;
  chunks: Record<string, ArrayBuffer>;
  updatedAt: number;
};

export const META_PREFIX = "partial_meta::";
export const CHUNK_PREFIX = "partial_chunk::";

export function metaKey(url: string): string {
  return `${META_PREFIX}${url}`;
}

export function chunkKey(url: string, offset: number): string {
  return `${CHUNK_PREFIX}${url}::${offset}`;
}

export function isLegacyPartialValue(v: unknown): boolean {
  return Boolean(v && typeof v === "object" && "chunks" in (v as object));
}

export type IdbFns = {
  get: <T>(store: string, key: string) => Promise<T | null>;
  put: (store: string, key: string, value: unknown) => Promise<void>;
  del: (store: string, key: string) => Promise<void>;
  open: () => Promise<IDBDatabase>;
  storeName: string;
  fileLabel: (url: string) => string;
};

export async function savePartialChunk(
  idb: IdbFns,
  url: string,
  offset: number,
  buf: ArrayBuffer
): Promise<void> {
  await idb.put(idb.storeName, chunkKey(url, offset), buf);
}

export async function savePartialMeta(idb: IdbFns, meta: PartialMeta): Promise<void> {
  await idb.put(idb.storeName, metaKey(meta.url), meta);
}

export async function persistPartialProgress(
  idb: IdbFns,
  url: string,
  totalBytes: number,
  receivedBytes: number,
  offset: number,
  buf: ArrayBuffer
): Promise<void> {
  await savePartialChunk(idb, url, offset, buf);
  await savePartialMeta(idb, {
    url,
    totalBytes,
    receivedBytes,
    updatedAt: Date.now(),
  });
}

export async function loadPartial(
  idb: IdbFns,
  url: string
): Promise<PartialRecord | null> {
  const legacy = await idb.get<unknown>(idb.storeName, url);
  if (isLegacyPartialValue(legacy)) {
    console.info(
      "[voice][supertonic] discarding legacy partial schema (single-record chunks map)",
      { url: idb.fileLabel(url) }
    );
    await idb.del(idb.storeName, url);
    return null;
  }

  const meta = await idb.get<PartialMeta>(idb.storeName, metaKey(url));
  if (!meta) return null;

  const chunks = await idbGetChunksForUrl(idb, url);
  let received = 0;
  for (const buf of Object.values(chunks)) received += buf.byteLength;

  return {
    url: meta.url,
    totalBytes: meta.totalBytes,
    receivedBytes: received,
    chunks,
    updatedAt: meta.updatedAt,
  };
}

async function idbGetChunksForUrl(
  idb: IdbFns,
  url: string
): Promise<Record<string, ArrayBuffer>> {
  const prefix = `${CHUNK_PREFIX}${url}::`;
  const out: Record<string, ArrayBuffer> = {};
  try {
    const db = await idb.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(idb.storeName, "readonly");
        const store = tx.objectStore(idb.storeName);
        const range = IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff));
        const req = store.openCursor(range);
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const key = String(cursor.key);
          const offset = key.slice(prefix.length);
          if (cursor.value instanceof ArrayBuffer) {
            out[offset] = cursor.value;
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch (e) {
    console.warn("[voice][supertonic] idbGetChunksForUrl failed", e);
  }
  return out;
}

export async function clearPartial(idb: IdbFns, url: string): Promise<void> {
  await idb.del(idb.storeName, url);
  await idb.del(idb.storeName, metaKey(url));
  const prefix = `${CHUNK_PREFIX}${url}::`;
  try {
    const db = await idb.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(idb.storeName, "readwrite");
        const store = tx.objectStore(idb.storeName);
        const range = IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff));
        const req = store.openCursor(range);
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}
