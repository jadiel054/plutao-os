/**
 * Engine de voz Plutão — client-only.
 * Kokoro (en) + Piper (pt-BR) + speechSynthesis fallback.
 */

import {
  KOKORO_DTYPE,
  KOKORO_MODEL_ID,
  DEFAULT_PACK_ID,
  DEFAULT_VOICE_ID,
  PIPER_PT_BR_VOICE_ID,
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

const IDB_KEY = "plutao_voice_pack_ready_v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kokoroInstance: any = null;
let kokoroLoadPromise: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let piperSession: any = null;
let piperLoadPromise: Promise<void> | null = null;
let piperVoiceLoaded: string | null = null;

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
  if (packId === "kokoro-en") {
    kokoroInstance = null;
    kokoroLoadPromise = null;
  }
  if (packId === "piper-pt-br") {
    piperSession = null;
    piperLoadPromise = null;
    piperVoiceLoaded = null;
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
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

function playBlob(blob: Blob, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao reproduzir áudio Piper"));
    };
    void audio.play().catch(reject);
  });
}

async function ensureKokoro(onProgress?: ProgressCb): Promise<void> {
  if (kokoroInstance) return;
  if (kokoroLoadPromise) return kokoroLoadPromise;

  kokoroLoadPromise = (async () => {
    onProgress?.(0, "downloading", "Carregando Kokoro…");
    console.info("[voice] kokoro download", KOKORO_MODEL_ID);
    const device =
      typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";
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
    kokoroInstance = tts;
    markPackReady("kokoro-en");
    onProgress?.(100, "ready", "Pronto");
    console.info("[voice] kokoro ready", { device });
  })();

  try {
    await kokoroLoadPromise;
  } catch (e) {
    kokoroLoadPromise = null;
    onProgress?.(0, "error", e instanceof Error ? e.message : "Falha Kokoro");
    throw e;
  }
}

async function ensurePiper(onProgress?: ProgressCb): Promise<void> {
  if (piperSession && piperVoiceLoaded === PIPER_PT_BR_VOICE_ID) return;
  if (piperLoadPromise) return piperLoadPromise;

  piperLoadPromise = (async () => {
    onProgress?.(0, "downloading", "Carregando Piper pt-BR…");
    console.info("[voice] piper download", PIPER_PT_BR_VOICE_ID);
    const { TtsSession } = await import("@realtimex/piper-tts-web");
    const session = new TtsSession({
      voiceId: PIPER_PT_BR_VOICE_ID,
      progress: (progress: { loaded?: number; total?: number }) => {
        const loaded = progress.loaded ?? 0;
        const total = progress.total ?? 1;
        const pct = Math.min(99, Math.round((loaded / Math.max(total, 1)) * 100));
        onProgress?.(pct, "downloading", "piper");
      },
      logger: (msg: string) => console.info("[voice/piper]", msg),
    });
    // Warm-up / force model fetch with a short utterance path if API requires
    piperSession = session;
    piperVoiceLoaded = PIPER_PT_BR_VOICE_ID;
    markPackReady("piper-pt-br");
    onProgress?.(100, "ready", "Pronto");
    console.info("[voice] piper ready");
  })();

  try {
    await piperLoadPromise;
  } catch (e) {
    piperLoadPromise = null;
    piperSession = null;
    piperVoiceLoaded = null;
    onProgress?.(0, "error", e instanceof Error ? e.message : "Falha Piper");
    throw e;
  }
}

export async function downloadPack(
  packId: VoicePackId,
  onProgress?: ProgressCb
): Promise<void> {
  if (packId === "kokoro-en") {
    await ensureKokoro(onProgress);
    return;
  }
  if (packId === "piper-pt-br") {
    await ensurePiper(onProgress);
    return;
  }
  throw new Error("Pack não suportado");
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

export async function speakText(
  text: string,
  prefs: VoiceRuntimePrefs,
  opts?: { onProgress?: ProgressCb; preferNative?: boolean }
): Promise<{ engine: "kokoro" | "piper" | "native" }> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { engine: "native" };

  stopSpeaking();

  const pack = getPack(prefs.packId);
  const useOnDevice = prefs.enabled && !opts?.preferNative && Boolean(pack);

  if (!useOnDevice || !pack) {
    await speakNative(clean, prefs);
    return { engine: "native" };
  }

  try {
    if (pack.engine === "kokoro") {
      if (!kokoroInstance) {
        opts?.onProgress?.(0, "downloading", "Baixando Kokoro…");
        const nativePromise = speakNative(clean, prefs);
        void ensureKokoro(opts?.onProgress).catch(() => undefined);
        await nativePromise;
        return { engine: "native" };
      }
      await ensureKokoro(opts?.onProgress);
      const result = await kokoroInstance.generate(clean.slice(0, 2000), {
        voice: prefs.voiceId || "af_heart",
        speed: prefs.speed,
      });
      if (result?.audio && result?.sampling_rate) {
        await playFloat32(result.audio, result.sampling_rate, prefs.volume);
      }
      return { engine: "kokoro" };
    }

    if (pack.engine === "piper") {
      if (!piperSession) {
        opts?.onProgress?.(0, "downloading", "Baixando Piper pt-BR…");
        const nativePromise = speakNative(clean, prefs);
        void ensurePiper(opts?.onProgress).catch(() => undefined);
        await nativePromise;
        return { engine: "native" };
      }
      await ensurePiper(opts?.onProgress);
      const blob: Blob = await piperSession.predict(clean.slice(0, 2000));
      // speed: HTMLAudioElement playbackRate
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.volume = Math.min(1, Math.max(0, prefs.volume));
        audio.playbackRate = Math.min(2, Math.max(0.5, prefs.speed));
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Piper playback error"));
        };
        void audio.play().catch(reject);
      });
      return { engine: "piper" };
    }
  } catch (e) {
    console.warn("[voice] on-device failed, native fallback", e);
    await speakNative(clean, prefs);
    return { engine: "native" };
  }

  await speakNative(clean, prefs);
  return { engine: "native" };
}

export const SAMPLE_PHRASE =
  "Plutão online. Voz on-device, sem enviar texto para a nuvem.";
