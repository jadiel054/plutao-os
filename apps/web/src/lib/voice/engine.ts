/**
 * Engine de voz Plutão — client-only.
 * Kokoro on-device (lazy) + speechSynthesis (pt-BR e fallback).
 */

import {
  KOKORO_DTYPE,
  KOKORO_MODEL_ID,
  DEFAULT_PACK_ID,
  DEFAULT_VOICE_ID,
  getPack,
  type VoicePackId,
} from "./packs";

export type VoiceRuntimePrefs = {
  enabled: boolean;
  packId: string;
  voiceId: string;
  speed: number;
  volume: number;
};

export type PackStatus = "idle" | "downloading" | "ready" | "error";

type ProgressCb = (pct: number, status: PackStatus, detail?: string) => void;

const IDB_KEY = "plutao_voice_pack_ready_v1";

let kokoroInstance: {
  generate: (text: string, opts: { voice: string; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate: number } | { save: (n: string) => void }>;
} | null = null;
let loadPromise: Promise<void> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function defaultVoicePrefs(): VoiceRuntimePrefs {
  return {
    enabled: false,
    packId: DEFAULT_PACK_ID,
    voiceId: DEFAULT_VOICE_ID,
    speed: 1,
    volume: 0.9,
  };
}

export function isPackMarkedReady(packId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(IDB_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(map[packId]);
  } catch {
    return false;
  }
}

function markPackReady(packId: string) {
  try {
    const raw = localStorage.getItem(IDB_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[packId] = true;
    localStorage.setItem(IDB_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function clearPackReady(packId: string) {
  try {
    const raw = localStorage.getItem(IDB_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, boolean>;
    delete map[packId];
    localStorage.setItem(IDB_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  kokoroInstance = null;
  loadPromise = null;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

function playFloat32(audio: Float32Array, sampleRate: number, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ctx = new AudioContext({ sampleRate });
      const buffer = ctx.createBuffer(1, audio.length, sampleRate);
      buffer.copyToChannel(audio, 0);
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

async function ensureKokoro(onProgress?: ProgressCb): Promise<void> {
  if (kokoroInstance) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress?.(0, "downloading", "Carregando modelo Kokoro…");
    console.info("[voice] downloading", KOKORO_MODEL_ID, KOKORO_DTYPE);

    const device =
      typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";

    // Dynamic import — never on first paint of the app shell
    const { KokoroTTS } = await import("kokoro-js");

    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: device === "webgpu" ? "fp32" : KOKORO_DTYPE,
      device,
      progress_callback: (p: { progress?: number; status?: string }) => {
        const pct =
          typeof p.progress === "number"
            ? Math.min(99, Math.max(0, Math.round(p.progress)))
            : 10;
        onProgress?.(pct, "downloading", p.status ?? "download");
      },
    });

    kokoroInstance = tts as typeof kokoroInstance;
    markPackReady(DEFAULT_PACK_ID);
    onProgress?.(100, "ready", "Pronto");
    console.info("[voice] kokoro ready", { device });
  })();

  try {
    await loadPromise;
  } catch (e) {
    loadPromise = null;
    onProgress?.(0, "error", e instanceof Error ? e.message : "Falha no download");
    throw e;
  }
}

export async function downloadPack(
  packId: VoicePackId,
  onProgress?: ProgressCb
): Promise<void> {
  if (packId !== "kokoro-en") {
    throw new Error("Pack não suportado");
  }
  await ensureKokoro(onProgress);
}

function speakNative(text: string, prefs: VoiceRuntimePrefs): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text.slice(0, 4000));
    u.lang = "pt-BR";
    u.rate = prefs.speed;
    u.volume = prefs.volume;
    const voices = window.speechSynthesis.getVoices();
    const pt = voices.find((v) => v.lang.toLowerCase().startsWith("pt"));
    if (pt) u.voice = pt;
    u.onend = () => {
      currentUtterance = null;
      resolve();
    };
    u.onerror = () => {
      currentUtterance = null;
      resolve();
    };
    currentUtterance = u;
    window.speechSynthesis.speak(u);
  });
}

/**
 * Fala texto com engine ativa. Nova chamada interrompe a anterior.
 * Sem pack / enabled=false → speechSynthesis (AC4).
 */
export async function speakText(
  text: string,
  prefs: VoiceRuntimePrefs,
  opts?: { onProgress?: ProgressCb; preferNative?: boolean }
): Promise<{ engine: "kokoro" | "native" }> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { engine: "native" };

  stopSpeaking();

  const useKokoro =
    prefs.enabled &&
    !opts?.preferNative &&
    Boolean(getPack(prefs.packId));

  if (!useKokoro) {
    await speakNative(clean, prefs);
    return { engine: "native" };
  }

  try {
    if (!kokoroInstance) {
      // Fallback enquanto baixa (AC4 + aviso discreto)
      opts?.onProgress?.(0, "downloading", "Baixando voz on-device…");
      const nativePromise = speakNative(clean, prefs);
      void ensureKokoro(opts?.onProgress).catch(() => undefined);
      await nativePromise;
      return { engine: "native" };
    }

    await ensureKokoro(opts?.onProgress);
    const tts = kokoroInstance!;
    const result = await tts.generate(clean.slice(0, 2000), {
      voice: prefs.voiceId || DEFAULT_VOICE_ID,
      speed: prefs.speed,
    });

    // kokoro-js RawAudio: { audio: Float32Array, sampling_rate }
    const raw = result as { audio?: Float32Array; sampling_rate?: number };
    if (raw.audio && raw.sampling_rate) {
      await playFloat32(raw.audio, raw.sampling_rate, prefs.volume);
    }
    return { engine: "kokoro" };
  } catch (e) {
    console.warn("[voice] kokoro failed, native fallback", e);
    await speakNative(clean, prefs);
    return { engine: "native" };
  }
}

export const SAMPLE_PHRASE =
  "Plutão online. Voz on-device, sem enviar texto para a nuvem.";
