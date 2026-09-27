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
};

let activeFloat32: ActiveFloat32 | null = null;

/** Stop and release the current float32 source + AudioContext, if any. */
export function stopActiveFloat32Playback(): void {
  if (!activeFloat32) return;
  const entry = activeFloat32;
  activeFloat32 = null;
  entry.settled = true;
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
  entry.resolve();
}

/**
 * Play a mono Float32Array. Interrupts any previous float32 playback.
 * Promise resolves when playback ends naturally or is stopped.
 */
export function playFloat32(
  audio: Float32Array,
  sampleRate: number,
  volume: number
): Promise<void> {
  stopActiveFloat32Playback();

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
        resolve: () => {
          if (!entry.settled) {
            entry.settled = true;
            resolve();
          }
        },
      };
      activeFloat32 = entry;

      source.onended = () => {
        if (activeFloat32 === entry) activeFloat32 = null;
        try {
          void ctx.close();
        } catch {
          /* ignore */
        }
        entry.resolve();
      };

      source.start();
    } catch (e) {
      reject(e);
    }
  });
}
