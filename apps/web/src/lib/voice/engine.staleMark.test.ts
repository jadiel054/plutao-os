/**
 * Regressão: marca localStorage "pronto" com assets ausentes não deve
 * empurrar speakText para o path bloqueante de speakSupertonic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const IDB_KEY = "plutao_voice_pack_ready_v1";

const speakSupertonic = vi.fn<any>(async () => {
  throw new Error("speakSupertonic não deveria ser chamado com assets ausentes");
});
const isSupertonicReady = vi.fn<any>(async () => false);
const clearSupertonic = vi.fn<any>(async () => undefined);
const downloadSupertonic = vi.fn<any>(async () => undefined);

vi.mock("./supertonic/runtime", () => ({
  isSupertonicReady: () => isSupertonicReady(),
  speakSupertonic: (...args: any[]) => speakSupertonic(...args),
  clearSupertonic: () => clearSupertonic(),
  downloadSupertonic: (...args: any[]) => downloadSupertonic(...args),
}));

vi.mock("./audioPlayback", () => ({
  playFloat32: vi.fn(async () => undefined),
  stopActiveFloat32Playback: vi.fn(),
}));

describe("speakText — stale ready mark vs assets ausentes", () => {
  beforeEach(() => {
    vi.resetModules();
    isSupertonicReady.mockResolvedValue(false);
    speakSupertonic.mockClear();
    clearSupertonic.mockClear();
    downloadSupertonic.mockClear();

    const store: Record<string, string> = {
      [IDB_KEY]: JSON.stringify({ "supertonic-pt-br": true }),
    };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel: vi.fn(),
        speak: vi.fn((u: { onend?: () => void }) => {
          queueMicrotask(() => u.onend?.());
        }),
        getVoices: () => [],
      },
      SpeechSynthesisUtterance: class {
        text = "";
        lang = "";
        rate = 1;
        volume = 1;
        voice: unknown = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(t: string) {
          this.text = t;
        }
      },
    });
    // SpeechSynthesisUtterance also referenced as global in some paths
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      (globalThis as { window: { SpeechSynthesisUtterance: unknown } }).window
        .SpeechSynthesisUtterance
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("com marca pronta e assets ausentes: retorna native, limpa marca, não chama speakSupertonic", async () => {
    const { speakText, isPackMarkedReady } = await import("./engine");

    expect(isPackMarkedReady("supertonic-pt-br")).toBe(true);

    const result = await speakText("teste", {
      enabled: true,
      packId: "supertonic-pt-br",
      voiceId: "F1",
      speed: 1,
      volume: 0.9,
    });

    expect(result.engine).toBe("native");
    expect(speakSupertonic).not.toHaveBeenCalled();
    expect(isPackMarkedReady("supertonic-pt-br")).toBe(false);
  });

  it("com assets presentes: chama speakSupertonic e retorna engine supertonic", async () => {
    isSupertonicReady.mockResolvedValue(true);
    speakSupertonic.mockResolvedValue(undefined as never);

    const { speakText } = await import("./engine");

    const result = await speakText("teste", {
      enabled: true,
      packId: "supertonic-pt-br",
      voiceId: "F1",
      speed: 1,
      volume: 0.9,
    });

    expect(result.engine).toBe("supertonic");
    expect(speakSupertonic).toHaveBeenCalledTimes(1);
  });
});
