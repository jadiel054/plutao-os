import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { playFloat32, stopActiveFloat32Playback } from "./audioPlayback";

type MockSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

type MockCtx = {
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  destination: object;
  close: ReturnType<typeof vi.fn>;
  _sources: MockSource[];
};

function installAudioMock() {
  const contexts: MockCtx[] = [];

  class MockAudioContext {
    destination = {};
    _sources: MockSource[] = [];
    createBuffer = vi.fn((_ch: number, length: number, _sr: number) => ({
      length,
      copyToChannel: vi.fn(),
    }));
    createGain = vi.fn(() => ({
      gain: { value: 1 },
      connect: vi.fn(),
    }));
    createBufferSource = vi.fn(() => {
      const src: MockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(() => {
          // Simulate WebAudio: stop() ends the source
          if (src.onended) src.onended();
        }),
        onended: null,
      };
      this._sources.push(src);
      return src;
    });
    close = vi.fn().mockResolvedValue(undefined);

    constructor(_opts?: { sampleRate?: number }) {
      contexts.push(this as unknown as MockCtx);
    }
  }

  vi.stubGlobal("AudioContext", MockAudioContext);

  return {
    contexts,
    restore: () => {
      vi.unstubAllGlobals();
      contexts.length = 0;
    },
  };
}

describe("audioPlayback — interruptible float32", () => {
  let mock: ReturnType<typeof installAudioMock>;

  beforeEach(() => {
    mock = installAudioMock();
  });

  afterEach(() => {
    stopActiveFloat32Playback();
    mock.restore();
  });

  it("playFloat32 starts a source and resolves on natural end", async () => {
    const samples = new Float32Array([0, 0.1, -0.1]);
    const p = playFloat32(samples, 24000, 0.8);

    expect(mock.contexts).toHaveLength(1);
    const ctx = mock.contexts[0];
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    const src = ctx._sources[0];
    expect(src.start).toHaveBeenCalledTimes(1);

    // natural end
    src.onended?.();
    await p;
    expect(ctx.close).toHaveBeenCalled();
  });

  it("stopActiveFloat32Playback stops source, closes ctx, resolves promise", async () => {
    const samples = new Float32Array(8);
    const p = playFloat32(samples, 16000, 1);

    const ctx = mock.contexts[0];
    const src = ctx._sources[0];

    stopActiveFloat32Playback();

    expect(src.stop).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalled();
    await expect(p).resolves.toBeUndefined();
  });

  it("second playFloat32 interrupts the first (first does not complete natural playback)", async () => {
    const first = playFloat32(new Float32Array(16), 22050, 0.5);
    const ctx1 = mock.contexts[0];
    const src1 = ctx1._sources[0];

    // second call must interrupt first
    const second = playFloat32(new Float32Array(4), 22050, 0.9);

    expect(src1.stop).toHaveBeenCalledTimes(1);
    expect(ctx1.close).toHaveBeenCalled();
    await expect(first).resolves.toBeUndefined();

    expect(mock.contexts).toHaveLength(2);
    const ctx2 = mock.contexts[1];
    const src2 = ctx2._sources[0];
    expect(src2.start).toHaveBeenCalledTimes(1);

    // complete second naturally
    src2.onended?.();
    await second;
  });

  it("stopSpeaking path via stopActiveFloat32Playback is idempotent", () => {
    expect(() => stopActiveFloat32Playback()).not.toThrow();
    expect(() => stopActiveFloat32Playback()).not.toThrow();
  });
});
