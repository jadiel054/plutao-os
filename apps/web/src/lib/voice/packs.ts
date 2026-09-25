/**
 * Catálogo de packs de voz on-device (Kokoro).
 * Fonte: https://github.com/hexgrad/kokoro/blob/main/kokoro.js/README.md
 * npm: kokoro-js@1.2.1 — VOICES oficiais = en-us + en-gb apenas.
 * pt-BR: NÃO suportado pelo kokoro-js browser; usar speechSynthesis.
 */

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** q8 ~80–100 MB na prática (Transformers.js + pesos quantizados). */
export const KOKORO_DTYPE = "q8" as const;

export type VoicePackId = "kokoro-en";

export type VoiceEntry = {
  id: string;
  name: string;
  language: "en-us" | "en-gb";
  gender: "Female" | "Male";
  grade?: string;
};

export type VoicePackMeta = {
  id: VoicePackId;
  name: string;
  description: string;
  /** Tamanho aproximado do download (modelo q8 + tokenizer). */
  approxSizeMb: number;
  languages: string[];
  voices: VoiceEntry[];
  modelId: string;
};

/** Pack único: um modelo cobre todas as vozes EN listadas no README oficial. */
export const VOICE_PACKS: VoicePackMeta[] = [
  {
    id: "kokoro-en",
    name: "Inglês (Kokoro)",
    description:
      "Modelo on-device Kokoro-82M (WASM/WebGPU). Vozes americanas e britânicas. Texto não sai do navegador.",
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
];

export function getPack(id: string | undefined): VoicePackMeta | undefined {
  return VOICE_PACKS.find((p) => p.id === id);
}

export const DEFAULT_VOICE_ID = "af_heart";
export const DEFAULT_PACK_ID: VoicePackId = "kokoro-en";
