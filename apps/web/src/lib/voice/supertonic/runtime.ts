/**
 * Runtime Supertonic 3 — assets HF + Cache API/IDB + helper oficial (MIT).
 * WebGPU → WASM via onnxruntime-web.
 * Speed: parâmetro nativo (duration /= speed), faixa 0.7–2.0.
 */
import {
  downloadSupertonicPack,
  isSupertonicCached,
  clearSupertonicCache,
  resolveAssetUrl,
} from "./download";
import { voiceStyleRel, SUPERTONIC_VOICE_IDS } from "./assets";

export type SupertonicProgress = (pct: number, detail?: string) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tts: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let styles: Record<string, any> = {};
let loadPromise: Promise<void> | null = null;
const blobUrls: string[] = [];

export async function isSupertonicReady(): Promise<boolean> {
  return isSupertonicCached();
}

export async function downloadSupertonic(onProgress?: SupertonicProgress): Promise<void> {
  await downloadSupertonicPack((p) => onProgress?.(p.pct, p.detail));
}

export async function clearSupertonic(): Promise<void> {
  tts = null;
  styles = {};
  loadPromise = null;
  while (blobUrls.length) {
    const u = blobUrls.pop();
    if (u) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
  }
  await clearSupertonicCache();
}

async function blobUrl(rel: string): Promise<string> {
  const u = await resolveAssetUrl(rel);
  if (u.startsWith("blob:")) blobUrls.push(u);
  return u;
}

async function ensureLoaded(onProgress?: SupertonicProgress): Promise<void> {
  if (tts) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress?.(5, "Verificando cache…");
    if (!(await isSupertonicCached())) {
      onProgress?.(10, "Baixando modelos Supertonic (~398 MB)…");
      await downloadSupertonicPack((p) =>
        onProgress?.(Math.min(80, 10 + Math.round(p.pct * 0.7)), p.detail)
      );
    }

    onProgress?.(82, "Carregando onnxruntime-web…");
    const ort = await import("onnxruntime-web");
    if (ort.env?.wasm) {
      ort.env.wasm.numThreads = 1;
    }

    onProgress?.(85, "Resolvendo assets…");
    const helper = await import("./helper.js");

    const sessionOptionsBase = {
      graphOptimizationLevel: "all" as const,
    };

    const providers: string[][] = [];
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      providers.push(["webgpu"]);
    }
    providers.push(["wasm"]);

    const dpPath = await blobUrl("onnx/duration_predictor.onnx");
    const textEncPath = await blobUrl("onnx/text_encoder.onnx");
    const vectorEstPath = await blobUrl("onnx/vector_estimator.onnx");
    const vocoderPath = await blobUrl("onnx/vocoder.onnx");
    const ttsJsonUrl = await blobUrl("onnx/tts.json");
    const indexerUrl = await blobUrl("onnx/unicode_indexer.json");

    const cfgsRes = await fetch(ttsJsonUrl);
    const cfgs = await cfgsRes.json();
    const indexerRes = await fetch(indexerUrl);
    const indexer = await indexerRes.json();
    const textProcessor = new helper.UnicodeProcessor(indexer);

    let sessions: unknown[] | null = null;
    let lastErr: unknown;
    for (const executionProviders of providers) {
      try {
        onProgress?.(88, `ONNX: ${executionProviders[0]}`);
        const opts = { ...sessionOptionsBase, executionProviders };
        const dpOrt = await helper.loadOnnx(dpPath, opts);
        onProgress?.(91, "text_encoder");
        const textEncOrt = await helper.loadOnnx(textEncPath, opts);
        onProgress?.(94, "vector_estimator");
        const vectorEstOrt = await helper.loadOnnx(vectorEstPath, opts);
        onProgress?.(97, "vocoder");
        const vocoderOrt = await helper.loadOnnx(vocoderPath, opts);
        sessions = [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt];
        break;
      } catch (e) {
        lastErr = e;
        console.warn("[voice][supertonic] provider failed", executionProviders, e);
      }
    }
    if (!sessions) throw lastErr ?? new Error("Supertonic: falha ao criar sessões ONNX");

    const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = sessions;
    tts = new helper.TextToSpeech(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt);

    for (const id of SUPERTONIC_VOICE_IDS) {
      const styleUrl = await blobUrl(voiceStyleRel(id));
      styles[id] = await helper.loadVoiceStyle([styleUrl], false);
    }
    onProgress?.(100, "Pronto");
  })();

  try {
    await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

export async function speakSupertonic(
  text: string,
  voiceId: string,
  opts: { speed: number; volume: number; onProgress?: SupertonicProgress }
): Promise<void> {
  await ensureLoaded(opts.onProgress);
  if (!tts) throw new Error("Supertonic não inicializado");

  const id = (SUPERTONIC_VOICE_IDS as readonly string[]).includes(voiceId) ? voiceId : "F1";
  const style = styles[id];
  if (!style) throw new Error(`Estilo ${id} ausente`);

  const speed = Math.min(2, Math.max(0.7, opts.speed || 1.05));
  const result = await tts.call(text.slice(0, 2000), "pt", style, 8, speed, 0.3);
  const raw = result.wav;
  const wav = raw instanceof Float32Array ? raw : new Float32Array(raw as number[]);
  const sampleRate = (tts.sampleRate as number) || 44100;
  await playFloat32(wav, sampleRate, opts.volume);
}

function playFloat32(audio: Float32Array, sampleRate: number, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ctx = new AudioContext({ sampleRate });
      const buffer = ctx.createBuffer(1, audio.length, sampleRate);
      const channel = new Float32Array(audio.length);
      channel.set(audio);
      buffer.copyToChannel(channel, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, volume));
      src.connect(gain);
      gain.connect(ctx.destination);
      src.onended = () => {
        void ctx.close();
        resolve();
      };
      src.start();
    } catch (e) {
      reject(e);
    }
  });
}
