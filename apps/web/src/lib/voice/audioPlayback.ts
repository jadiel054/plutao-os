/**
 * Client-only WebAudio float32 playback with a single active source.
 * Guarantees: a new playFloat32 (or stopActiveFloat32Playback) interrupts
 * any previous playback — used by Kokoro and Supertonic paths.
 */

type ActiveFloat32 = {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
  settled: boolean;
  resolve: () => void;
  tickTimer: ReturnType<typeof setInterval> | null;
};

let activeFloat32: ActiveFloat32 | null = null;

/** mm:ss from milliseconds (pure). */
export function formatPlaybackClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Duration of a mono float32 buffer in ms (pure). */
export function float32DurationMs(sampleCount: number, sampleRate: number): number {
  if (sampleRate <= 0 || sampleCount <= 0) return 0;
  return (sampleCount / sampleRate) * 1000;
}

/** Elapsed ms from AudioContext currentTime relative to start (pure). */
export function elapsedFromContext(currentTime: number, startedAt: number): number {
  return Math.max(0, (currentTime - startedAt) * 1000);
}

export type PlaybackTick = (elapsedMs: number, totalMs: number | null) => void;

/** Stop and release the current float32 source + AudioContext, if any. */
export function stopActiveFloat32Playback(): void {
  if (!activeFloat32) return;
  const entry = activeFloat32;
  activeFloat32 = null;
  if (entry.tickTimer != null) {
    clearInterval(entry.tickTimer);
    entry.tickTimer = null;
  }
  try {
    entry.source.stop();
  } catch {
    /* already stopped or never started */
  }
  try {
    void entry.ctx.close();
  } catch {
    /* ignore */
  }
  // resolve() is idempotent via entry.settled — do NOT set settled before this call
  entry.resolve();
}

/**
 * Play a mono Float32Array. Interrupts any previous float32 playback.
 * Promise resolves when playback ends naturally or is stopped.
 * onTick fires ~4×/s with elapsed/total ms when provided.
 */
export function playFloat32(
  audio: Float32Array,
  sampleRate: number,
  volume: number,
  opts?: { onTick?: PlaybackTick }
): Promise<void> {
  stopActiveFloat32Playback();

  const totalMs = float32DurationMs(audio.length, sampleRate);
  const onTick = opts?.onTick;

  return new Promise((resolve, reject) => {
    try {
      const ctx = new AudioContext({ sampleRate });
      const buffer = ctx.createBuffer(1, audio.length, sampleRate);
      const channel = new Float32Array(audio.length);
      channel.set(audio);
      buffer.copyToChannel(channel, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, volume));
      source.connect(gain);
      gain.connect(ctx.destination);

      const entry: ActiveFloat32 = {
        ctx,
        source,
        settled: false,
        tickTimer: null,
        resolve: () => {
          if (!entry.settled) {
            entry.settled = true;
            if (entry.tickTimer != null) {
              clearInterval(entry.tickTimer);
              entry.tickTimer = null;
            }
            resolve();
          }
        },
      };
      activeFloat32 = entry;

      source.onended = () => {
        if (activeFloat32 === entry) activeFloat32 = null;
        if (entry.tickTimer != null) {
          clearInterval(entry.tickTimer);
          entry.tickTimer = null;
        }
        if (onTick && totalMs > 0) {
          try {
            onTick(totalMs, totalMs);
          } catch {
            /* ignore tick errors */
          }
        }
        try {
          void ctx.close();
        } catch {
          /* ignore */
        }
        entry.resolve();
      };

      const startedAt = ctx.currentTime;
      source.start();

      if (onTick) {
        onTick(0, totalMs);
        entry.tickTimer = setInterval(() => {
          if (entry.settled || activeFloat32 !== entry) return;
          const elapsed = Math.min(totalMs, elapsedFromContext(ctx.currentTime, startedAt));
          try {
            onTick(elapsed, totalMs);
          } catch {
            /* ignore */
          }
        }, 250);
      }
    } catch (e) {
      reject(e);
    }
  });
}
