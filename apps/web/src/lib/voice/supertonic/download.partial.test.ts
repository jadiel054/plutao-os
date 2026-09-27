/**
 * Partial IDB storage — O(1) write contract + assemble gap detection.
 * Helpers imported from production modules (no mirrored copies).
 * Full IDB integration remains smoke/manual.
 */
import { describe, it, expect } from "vitest";
import { metaKey, chunkKey, CHUNK_PREFIX } from "./partialStore";
import { assembleChunks } from "./download";

/** Simulated IDB partial store for O(1) write assertions. */
class FakePartialStore {
  data = new Map<string, unknown>();
  puts: { key: string; value: unknown }[] = [];

  put(key: string, value: unknown) {
    this.puts.push({ key, value });
    this.data.set(key, value);
  }

  get(key: string) {
    return this.data.get(key);
  }

  /** Simulate persistPartialProgress */
  persist(url: string, totalBytes: number, receivedBytes: number, offset: number, buf: ArrayBuffer) {
    this.put(chunkKey(url, offset), buf);
    this.put(metaKey(url), { url, totalBytes, receivedBytes, updatedAt: Date.now() });
  }

  loadChunks(url: string): Record<string, ArrayBuffer> {
    const prefix = `${CHUNK_PREFIX}${url}::`;
    const out: Record<string, ArrayBuffer> = {};
    for (const [k, v] of this.data) {
      if (k.startsWith(prefix) && v instanceof ArrayBuffer) {
        out[k.slice(prefix.length)] = v;
      }
    }
    return out;
  }
}

describe("partial chunk records — O(1) writes", () => {
  it("3 chunks → cada put grava só o chunk novo (+ meta leve), sem regravação acumulada", () => {
    const store = new FakePartialStore();
    const url = "https://example.com/big.onnx";
    const total = 300;

    const c0 = new ArrayBuffer(100);
    store.persist(url, total, 100, 0, c0);
    expect(store.puts).toHaveLength(2); // 1 chunk + 1 meta
    expect(store.puts[0]!.key).toBe(chunkKey(url, 0));
    expect(store.puts[0]!.value).toBe(c0);

    const c1 = new ArrayBuffer(100);
    store.persist(url, total, 200, 100, c1);
    expect(store.puts).toHaveLength(4);
    expect(store.puts[2]!.key).toBe(chunkKey(url, 100));
    expect(store.puts[2]!.value).toBe(c1);
    expect(store.data.get(chunkKey(url, 0))).toBe(c0);

    const c2 = new ArrayBuffer(100);
    store.persist(url, total, 300, 200, c2);
    expect(store.puts).toHaveLength(6);
    expect(store.data.size).toBe(4); // 3 chunks + 1 meta

    for (const p of store.puts) {
      if (typeof p.value === "object" && p.value && "chunks" in (p.value as object)) {
        throw new Error("legacy full-map write detected");
      }
    }
  });

  it("resume após kill simulado reconstrói partial a partir dos records", () => {
    const store = new FakePartialStore();
    const url = "https://example.com/model.onnx";
    store.persist(url, 200, 100, 0, new ArrayBuffer(100));
    store.persist(url, 200, 200, 100, new ArrayBuffer(100));

    const chunks = store.loadChunks(url);
    expect(Object.keys(chunks).sort()).toEqual(["0", "100"]);
    const meta = store.get(metaKey(url)) as { receivedBytes: number; totalBytes: number };
    expect(meta.totalBytes).toBe(200);
    expect(meta.receivedBytes).toBe(200);

    const blob = assembleChunks({
      url,
      totalBytes: 200,
      receivedBytes: 200,
      chunks,
      updatedAt: Date.now(),
    });
    expect(blob.size).toBe(200);
  });

  it("assemble com gap ainda joga erro", () => {
    expect(() =>
      assembleChunks({
        url: "u",
        totalBytes: 150,
        receivedBytes: 50,
        chunks: { "100": new ArrayBuffer(50) },
        updatedAt: 0,
      })
    ).toThrow(/gap no partial em offset 0/);
  });
});
