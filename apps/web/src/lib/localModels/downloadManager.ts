/**
 * downloadManager — download REAL de modelos locais no navegador.
 *
 * Usa o pipeline do Transformers.js com progress_callback: os bytes reportados
 * são os bytes realmente baixados do Hugging Face e persistidos no cache do
 * navegador (IndexedDB/Cache API do Transformers.js). Nada de progresso simulado.
 *
 * Limitação conhecida (documentada): o Transformers.js não expõe AbortSignal
 * para o download em curso dentro de pipeline(). O cancelamento interrompe a
 * contabilização imediatamente e remove os arquivos já cacheados do repositório
 * após o arquivo em curso terminar. Um AbortController nativo depende de
 * suporte da lib (sugerido para acompanhar atualizações do @huggingface/transformers).
 */

type ProgressCallbackEvent = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
  name?: string;
};

export type DownloadProgressSnapshot = {
  loadedBytes: number;
  totalBytes: number;
  progress: number;
  speedMBs: number;
};

/** Agregador puro de progresso por arquivo — testável sem DOM. */
export class ProgressAggregator {
  private files = new Map<string, { loaded: number; total: number }>();
  private startedAt: number;
  private lastLoaded = 0;
  private lastAt: number;

  constructor(now: number = 0) {
    this.startedAt = now;
    this.lastAt = now;
  }

  apply(ev: ProgressCallbackEvent, now: number): DownloadProgressSnapshot {
    if (ev.file && ev.status === "progress" && typeof ev.loaded === "number" && typeof ev.total === "number") {
      this.files.set(ev.file, { loaded: ev.loaded, total: ev.total || 0 });
    }
    let loaded = 0;
    let total = 0;
    for (const f of this.files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    const dtMs = Math.max(1, now - this.lastAt);
    const dBytes = Math.max(0, loaded - this.lastLoaded);
    this.lastLoaded = loaded;
    this.lastAt = now;
    const speedMBs = dBytes / (1024 * 1024) / (dtMs / 1000);
    return {
      loadedBytes: loaded,
      totalBytes: total,
      progress: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
      speedMBs: Math.round(speedMBs * 10) / 10,
    };
  }
}

/** Chaves de cache do Transformers.js associadas a um repositório HF. */
export function cacheKeyMatchesRepo(url: string, hfRepo: string): boolean {
  return url.includes(hfRepo);
}

/** Remove do Cache API do navegador os arquivos cacheados de um repositório HF. */
export async function deleteCachedModelFiles(hfRepo: string): Promise<number> {
  if (typeof caches === "undefined") return 0;
  let removed = 0;
  const names = await caches.keys();
  for (const name of names) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (const req of keys) {
      if (cacheKeyMatchesRepo(req.url, hfRepo)) {
        const ok = await cache.delete(req);
        if (ok) removed += 1;
      }
    }
  }
  return removed;
}

/** Verifica se há arquivos cacheados de um repositório HF. */
export async function hasCachedModelFiles(hfRepo: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const names = await caches.keys();
  for (const name of names) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (keys.some((req) => cacheKeyMatchesRepo(req.url, hfRepo))) return true;
  }
  return false;
}

export type WarmResult =
  | { ok: true }
  | { ok: false; error: string; cancelled?: boolean };

/**
 * Aquece (baixa + prepara) um modelo local de verdade e reporta progresso real.
 * onProgress recebe snapshots agregados (bytes reais do HF).
 */
export async function warmLocalModel(opts: {
  hfRepo: string;
  device: "webgpu" | "cpu" | "auto";
  onProgress: (snapshot: DownloadProgressSnapshot) => void;
  isCancelled: () => boolean;
}): Promise<WarmResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Download de modelos locais exige navegador." };
  }
  try {
    const transformers = await import("@huggingface/transformers");
    if (typeof transformers.pipeline !== "function") {
      return { ok: false, error: "Transformers.js pipeline indisponível." };
    }
    let supported = opts.device !== "cpu";
    if (supported && window.navigator?.gpu) {
      try {
        const adapter = await window.navigator.gpu.requestAdapter();
        supported = !!adapter;
      } catch {
        supported = false;
      }
    } else if (opts.device !== "cpu") {
      supported = false;
    }
    const device = supported ? "webgpu" : "cpu";
    const aggregator = new ProgressAggregator(Date.now());
    await transformers.pipeline("text-generation", opts.hfRepo, {
      device,
      progress_callback: (ev: ProgressCallbackEvent) => {
        if (opts.isCancelled()) return;
        opts.onProgress(aggregator.apply(ev, Date.now()));
      },
    });
    if (opts.isCancelled()) {
      void deleteCachedModelFiles(opts.hfRepo);
      return { ok: false, error: "Download cancelado.", cancelled: true };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
