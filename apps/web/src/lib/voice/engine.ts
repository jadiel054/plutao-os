/**
 * Engine de voz Plutão — client-only.
 * Kokoro (en) + Piper (pt-BR) + Supertonic 3 (pt-BR multi-voz) + speechSynthesis.
 */

import {
  KOKORO_DTYPE,
  KOKORO_MODEL_ID,
  PIPER_VOICE_ID,
  DEFAULT_PACK_ID,
  DEFAULT_VOICE_ID,
  getPack,
  type VoicePackId,
} from "./packs";
import { playFloat32, stopActiveFloat32Playback, type PlaybackTick } from "./audioPlayback";
import { sanitizeForSpeech } from "./sanitizeForSpeech";
import {
  formatKokoroProgressDetail,
  formatPackError,
  formatPiperProgressDetail,
  PackDownloadError,
} from "./packErrors";

export type VoiceRuntimePrefs = {
  enabled: boolean;
  packId: string;
  voiceId: string;
  speed: number;
  volume: number;
};

export type PackStatus = "idle" | "downloading" | "ready" | "error";

type ProgressCb = (pct: number, status: PackStatus, detail?: string) => void;

/** Options for speakText — download progress + playback position ticks. */
export type SpeakOptions = {
  onProgress?: ProgressCb;
  preferNative?: boolean;
  /** ~4×/s during on-device playback. totalMs null for native (indeterminate). */
  onPlaybackTick?: PlaybackTick;
};

const IDB_KEY = "plutao_voice_pack_ready_v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kokoroInstance: any = null;
let kokoroLoadPromise: Promise<void> | null = null;

let piperSession: {
  predict: (text: string) => Promise<Blob>;
  ready: boolean;
} | null = null;
let piperLoadPromise: Promise<void> | null = null;

let currentAudio: HTMLAudioElement | null = null;
let _currentUtterance: SpeechSynthesisUtterance | null = null;

export { sanitizeForSpeech } from "./sanitizeForSpeech";

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
  }
  if (packId === "supertonic-pt-br") {
    void import("./supertonic/runtime")
      .then((m) => m.clearSupertonic())
      .catch(() => undefined);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  _currentUtterance = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  stopActiveFloat32Playback();
}

function playBlob(blob: Blob, volume: number, onTick?: PlaybackTick): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.volume = Math.min(1, Math.max(0, volume));

      const emit = () => {
        if (!onTick) return;
        const total =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration * 1000
            : null;
        const elapsed = (audio.currentTime || 0) * 1000;
        try {
          onTick(elapsed, total);
        } catch {
          /* ignore */
        }
      };

      if (onTick) {
        audio.addEventListener("timeupdate", emit);
        audio.addEventListener("loadedmetadata", emit);
      }

      audio.onended = () => {
        if (onTick) {
          const total =
            Number.isFinite(audio.duration) && audio.duration > 0
              ? audio.duration * 1000
              : (audio.currentTime || 0) * 1000;
          try {
            onTick(total, total);
          } catch {
            /* ignore */
          }
        }
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        reject(
          new PackDownloadError({
            packId: "piper-pt-br",
            packName: "Português BR (Piper)",
            file: PIPER_VOICE_ID,
            phase: "playback",
            cause: new Error("Falha ao reproduzir áudio"),
          })
        );
      };
      void audio.play().catch(reject);
    } catch (e) {
      reject(e);
    }
  });
}

async function ensureKokoro(onProgress?: ProgressCb): Promise<void> {
  if (kokoroInstance) return;
  if (kokoroLoadPromise) return kokoroLoadPromise;

  const packName = getPack("kokoro-en")?.name ?? "Inglês (Kokoro)";

  kokoroLoadPromise = (async () => {
    onProgress?.(0, "downloading", "Kokoro · iniciando download…");
    console.info("[voice] downloading kokoro", KOKORO_MODEL_ID, KOKORO_DTYPE);

    const device =
      typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";

    const { KokoroTTS } = await import("kokoro-js");

    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: device === "webgpu" ? "fp32" : KOKORO_DTYPE,
      device,
      progress_callback: (p: {
        progress?: number;
        status?: string;
        file?: string;
        name?: string;
      }) => {
        const pct =
          typeof p.progress === "number"
            ? Math.min(99, Math.max(0, Math.round(p.progress)))
            : 10;
        onProgress?.(pct, "downloading", formatKokoroProgressDetail(p, pct));
      },
    });

    kokoroInstance = tts;
    markPackReady("kokoro-en");
    onProgress?.(100, "ready", "Kokoro · pronto");
    console.info("[voice] kokoro ready", { device });
  })();

  try {
    await kokoroLoadPromise;
  } catch (e) {
    kokoroLoadPromise = null;
    const wrapped = new PackDownloadError({
      packId: "kokoro-en",
      packName,
      file: KOKORO_MODEL_ID.split("/").pop() || KOKORO_MODEL_ID,
      phase: "download",
      cause: e,
    });
    onProgress?.(0, "error", wrapped.message);
    throw wrapped;
  }
}

async function ensurePiper(onProgress?: ProgressCb): Promise<void> {
  if (piperSession?.ready) return;
  if (piperLoadPromise) return piperLoadPromise;

  const packName = getPack("piper-pt-br")?.name ?? "Português BR (Piper)";

  piperLoadPromise = (async () => {
    onProgress?.(0, "downloading", formatPiperProgressDetail(0, PIPER_VOICE_ID));
    console.info("[voice] downloading piper", PIPER_VOICE_ID);

    const { TtsSession } = await import("@realtimex/piper-tts-web");

    const session = await TtsSession.create({
      voiceId: PIPER_VOICE_ID,
      fallbackStrategy: "auto",
      allowLocalModels: true,
      progress: (p: { loaded?: number; total?: number }) => {
        if (p.total && p.total > 0 && typeof p.loaded === "number") {
          const pct = Math.min(99, Math.round((p.loaded / p.total) * 100));
          onProgress?.(pct, "downloading", formatPiperProgressDetail(pct, PIPER_VOICE_ID));
        }
      },
      logger: (msg: string) => console.info("[voice][piper]", msg),
    });

    piperSession = session;
    markPackReady("piper-pt-br");
    onProgress?.(100, "ready", "Piper · pronto");
    console.info("[voice] piper ready", PIPER_VOICE_ID);
  })();

  try {
    await piperLoadPromise;
  } catch (e) {
    piperLoadPromise = null;
    const wrapped = new PackDownloadError({
      packId: "piper-pt-br",
      packName,
      file: PIPER_VOICE_ID,
      phase: "download",
      cause: e,
    });
    onProgress?.(0, "error", wrapped.message);
    throw wrapped;
  }
}

async function ensureSupertonic(onProgress?: ProgressCb): Promise<void> {
  const { downloadSupertonic, isSupertonicReady } = await import("./supertonic/runtime");
  const ready = await isSupertonicReady();
  if (ready) {
    markPackReady("supertonic-pt-br");
    onProgress?.(100, "ready", "Pronto");
    return;
  }
  onProgress?.(0, "downloading", "Baixando Supertonic 3…");
  try {
    await downloadSupertonic((pct, detail) => {
      onProgress?.(pct, "downloading", detail);
    });
    markPackReady("supertonic-pt-br");
    onProgress?.(100, "ready", "Pronto");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voice][supertonic] download failed", e);
    onProgress?.(0, "error", msg);
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
  if (packId === "supertonic-pt-br") {
    await ensureSupertonic(onProgress);
    return;
  }
  throw new Error(`Pack não suportado: ${packId}`);
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
      _currentUtterance = null;
      resolve();
    };
    u.onerror = () => {
      _currentUtterance = null;
      resolve();
    };
    _currentUtterance = u;
    window.speechSynthesis.speak(u);
  });
}

/**
 * Fala texto com engine do pack ativo. Nova chamada interrompe a anterior.
 * Sem pack / enabled=false → speechSynthesis.
 *
 * Texto passa por sanitizeForSpeech (markdown → falável) antes de qualquer engine.
 *
 * Para Supertonic: a autoridade de "pronto" é isSupertonicReady() (assets reais).
 * Marca localStorage stale (assets evictados) é limpa e o caminho vira native +
 * download em background — nunca bloquear speak no download de ~398 MB.
 */
export async function speakText(
  text: string,
  prefs: VoiceRuntimePrefs,
  opts?: SpeakOptions
): Promise<{ engine: "kokoro" | "piper" | "supertonic" | "native" }> {
  const clean = sanitizeForSpeech(text);
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
        opts?.onProgress?.(0, "downloading", "Kokoro · baixando voz on-device…");
        const nativePromise = speakNative(clean, prefs);
        void ensureKokoro(opts?.onProgress).catch(() => undefined);
        await nativePromise;
        return { engine: "native" };
      }
      await ensureKokoro(opts?.onProgress);
      const result = await kokoroInstance!.generate(clean.slice(0, 2000), {
        voice: prefs.voiceId || DEFAULT_VOICE_ID,
        speed: prefs.speed,
      });
      if (result.audio && result.sampling_rate) {
        await playFloat32(result.audio, result.sampling_rate, prefs.volume, {
          onTick: opts?.onPlaybackTick,
        });
      }
      return { engine: "kokoro" };
    }

    if (pack.engine === "piper") {
      if (!piperSession?.ready) {
        opts?.onProgress?.(0, "downloading", formatPiperProgressDetail(0, PIPER_VOICE_ID));
        const nativePromise = speakNative(clean, prefs);
        void ensurePiper(opts?.onProgress).catch(() => undefined);
        await nativePromise;
        return { engine: "native" };
      }
      await ensurePiper(opts?.onProgress);
      const blob = await piperSession!.predict(clean.slice(0, 2000));
      await playBlob(blob, prefs.volume, opts?.onPlaybackTick);
      return { engine: "piper" };
    }

    if (pack.engine === "supertonic") {
      const { isSupertonicReady, speakSupertonic } = await import("./supertonic/runtime");
      const assetsReady = await isSupertonicReady();

      if (!assetsReady) {
        if (isPackMarkedReady("supertonic-pt-br")) {
          console.info(
            "[voice][supertonic] marca pronta stale — assets ausentes; limpando marca e re-baixando em background"
          );
          clearPackReady("supertonic-pt-br");
        }
        opts?.onProgress?.(0, "downloading", "Baixando Supertonic…");
        const nativePromise = speakNative(clean, prefs);
        void ensureSupertonic(opts?.onProgress).catch(() => undefined);
        await nativePromise;
        return { engine: "native" };
      }

      await speakSupertonic(clean, prefs.voiceId || "F1", {
        speed: prefs.speed,
        volume: prefs.volume,
        onProgress: (pct, detail) => opts?.onProgress?.(pct, "downloading", detail),
        onPlaybackTick: opts?.onPlaybackTick,
      });
      return { engine: "supertonic" };
    }

    await speakNative(clean, prefs);
    return { engine: "native" };
  } catch (e) {
    const detail =
      e instanceof PackDownloadError
        ? e.message
        : formatPackError({
            packId: pack.id,
            packName: pack.name,
            phase: "speak",
            cause: e,
          });
    console.warn("[voice] on-device failed, native fallback", detail, e);
    await speakNative(clean, prefs);
    return { engine: "native" };
  }
}

export const SAMPLE_PHRASE =
  "Plutão online. Voz on-device, sem enviar texto para a nuvem.";

export const SAMPLE_PHRASE_PT =
  "Plutão online. Voz em português, processada neste dispositivo.";
