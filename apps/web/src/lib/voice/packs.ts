/**
 * Catálogo de packs de voz on-device.
 *
 * Kokoro (kokoro-js@1.2.1):
 *   - Modelo: onnx-community/Kokoro-82M-v1.0-ONNX
 *   - VOICES ativos no package: só en-us / en-gb
 *   - pf_dora, pm_alex, pm_santa EXISTEM no HF e no voices.js mas estão
 *     COMENTADOS; KokoroTTS._validate_voice rejeita se usados.
 *   Conclusão FEAT-01b: NÃO habilitar pack kokoro-pt via kokoro-js 1.2.1.
 *
 * Piper (pt-BR):
 *   - @realtimex/piper-tts-web@1.1.1
 *   - voz: pt_BR-faber-medium (~63 MB ONNX, CC0)
 *   - NÃO usar pt_BR-edresson-low (falha OrtRun em builds conhecidos)
 */

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_DTYPE = "q8" as const;

export const PIPER_VOICE_ID = "pt_BR-faber-medium" as const;

export type VoicePackId = "kokoro-en" | "piper-pt-br";

export type VoiceEngine = "kokoro" | "piper" | "native";

export type VoiceEntry = {
  id: string;
  name: string;
  language: string;
  gender: "Female" | "Male";
  grade?: string;
};

export type VoicePackMeta = {
  id: VoicePackId;
  engine: Exclude<VoiceEngine, "native">;
  name: string;
  description: string;
  approxSizeMb: number;
  languages: string[];
  voices: VoiceEntry[];
  /** ID de modelo/voz na engine (HF ou Piper voiceId). */
  modelId: string;
};

export const VOICE_PACKS: VoicePackMeta[] = [
  {
    id: "kokoro-en",
    engine: "kokoro",
    name: "Inglês (Kokoro)",
    description:
      "Kokoro-82M on-device (WASM/WebGPU). Vozes americanas e britânicas. Texto não sai do navegador.",
    approxSizeMb: 90,
    languages: ["en-US", "en-GB"],
    modelId: KOKORO_MODEL_ID,
    voices: [
      { id: "af_heart", name: "Heart", language: "en-us", gender: "Female", grade: "A" },
      { id: "af_bella", name: "Bella", language: "en-us", gender: "Female", grade: "A-" },
      { id: "af_nicole", name: "Nicole", language: "en-us", gender: "Female", grade: "B-" },
      { id: "af_sarah", name: "Sarah", language: "en-us", gender: "Female", grade: "C+" },
      { id: "am_fenrir", name: "Fenrir", language: "en-us", gender: "Male", grade: "C+" },
      { id: "am_michael", name: "Michael", language: "en-us", gender: "Male", grade: "C+" },
      { id: "bf_emma", name: "Emma", language: "en-gb", gender: "Female", grade: "B-" },
      { id: "bf_isabella", name: "Isabella", language: "en-gb", gender: "Female", grade: "C" },
      { id: "bm_george", name: "George", language: "en-gb", gender: "Male", grade: "C" },
      { id: "bm_lewis", name: "Lewis", language: "en-gb", gender: "Male", grade: "D+" },
    ],
  },
  {
    id: "piper-pt-br",
    engine: "piper",
    name: "Português BR (Piper)",
    description:
      "Piper WASM on-device — voz pt_BR-faber-medium (CC0, ~63 MB). Preferida para pt-BR. Não usa edresson-low.",
    approxSizeMb: 63,
    languages: ["pt-BR"],
    modelId: PIPER_VOICE_ID,
    voices: [
      {
        id: PIPER_VOICE_ID,
        name: "Faber",
        language: "pt-BR",
        gender: "Male",
        grade: "medium",
      },
    ],
  },
];

export function getPack(id: string | undefined): VoicePackMeta | undefined {
  return VOICE_PACKS.find((p) => p.id === id);
}

export const DEFAULT_VOICE_ID = "af_heart";
export const DEFAULT_PACK_ID: VoicePackId = "kokoro-en";
/** Pack padrão quando o produto fala em pt-BR. */
export const DEFAULT_PT_PACK_ID: VoicePackId = "piper-pt-br";
