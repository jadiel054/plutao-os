/**
 * Catálogo de packs de voz on-device.
 *
 * Kokoro (kokoro-js@1.2.1): en-US / en-GB apenas (pf_* comentados na lib).
 * Piper: pt_BR-faber-medium leve (~63 MB).
 * Supertonic 3: oficial web/ (MIT) + HF Supertone/supertonic-3 ONNX
 *   (split opensource-multilingual, 31 langs incl. pt).
 *   10 vozes M1–M5 / F1–F5, lang=pt, ~398 MB medidos (fp32).
 *
 * NÃO usar Supertone/supertonic (sem sufixo): só opensource-en.
 */

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_DTYPE = "q8" as const;

export const PIPER_VOICE_ID = "pt_BR-faber-medium" as const;

/** HF repo + revision — multilíngue (pt). Medido 2026-09-25. */
export const SUPERTONIC_HF_REPO = "Supertone/supertonic-3";
export const SUPERTONIC_HF_REVISION = "main";
/**
 * Soma Content-Length (bytes→MB decimal) dos assets de download:
 * duration_predictor + text_encoder + vector_estimator + vocoder +
 * tts.json + unicode_indexer.json ≈ 398361202 B → 398 MB.
 * (Não é o ~400 MB de marketing; é medição HEAD real.)
 */
export const SUPERTONIC_PACK_SIZE_MB = 398;

export type VoicePackId = "kokoro-en" | "piper-pt-br" | "supertonic-pt-br";

export type VoiceEngine = "kokoro" | "piper" | "supertonic" | "native";

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
  modelId: string;
};

const SUPERTONIC_VOICES: VoiceEntry[] = [
  { id: "F1", name: "Supertonic F1", language: "pt-BR", gender: "Female", grade: "Sarah" },
  { id: "F2", name: "Supertonic F2", language: "pt-BR", gender: "Female", grade: "Lily" },
  { id: "F3", name: "Supertonic F3", language: "pt-BR", gender: "Female", grade: "Jessica" },
  { id: "F4", name: "Supertonic F4", language: "pt-BR", gender: "Female", grade: "Olivia" },
  { id: "F5", name: "Supertonic F5", language: "pt-BR", gender: "Female", grade: "Emily" },
  { id: "M1", name: "Supertonic M1", language: "pt-BR", gender: "Male", grade: "Alex" },
  { id: "M2", name: "Supertonic M2", language: "pt-BR", gender: "Male", grade: "James" },
  { id: "M3", name: "Supertonic M3", language: "pt-BR", gender: "Male", grade: "Robert" },
  { id: "M4", name: "Supertonic M4", language: "pt-BR", gender: "Male", grade: "Sam" },
  { id: "M5", name: "Supertonic M5", language: "pt-BR", gender: "Male", grade: "Daniel" },
];

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
    id: "supertonic-pt-br",
    engine: "supertonic",
    name: "Português BR (Supertonic)",
    description:
      `Supertonic 3 on-device (ONNX · WebGPU/WASM). 10 vozes M1–M5 / F1–F5 em pt-BR. ~${SUPERTONIC_PACK_SIZE_MB} MB — Wi-Fi recomendado. Licença OpenRAIL (pesos) + MIT (web helper).`,
    approxSizeMb: SUPERTONIC_PACK_SIZE_MB,
    languages: ["pt-BR"],
    modelId: SUPERTONIC_HF_REPO,
    voices: SUPERTONIC_VOICES,
  },
  {
    id: "piper-pt-br",
    engine: "piper",
    name: "Português BR (Piper · leve · 63 MB)",
    description:
      "Piper WASM — voz única pt_BR-faber-medium (CC0, ~63 MB). Opção para aparelhos fracos. Não usa edresson-low.",
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
export const DEFAULT_PT_PACK_ID: VoicePackId = "supertonic-pt-br";
