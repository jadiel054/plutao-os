/**
 * Catálogo de packs de voz on-device.
 *
 * Kokoro (kokoro-js@1.2.1):
 *   - VOICES oficiais ativas = só en-us / en-gb
 *   - pf_dora / pm_alex / pm_santa EXISTEM no modelo HF, mas estão
 *     COMENTADOS em kokoro.js/src/voices.js e _validate_voice rejeita.
 *   - Não inventar suporte pt-BR via kokoro-js sem fork.
 *
 * Piper (pt-BR):
 *   - @realtimex/piper-tts-web + voiceId pt_BR-faber-medium (CC0, ~63MB)
 *   - NÃO usar pt_BR-edresson-low (falhas de inferência conhecidas)
 */

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_DTYPE = "q8" as const;

/** Voice ID Piper oficial (HF / CDN do piper-tts-web). */
export const PIPER_PT_BR_VOICE_ID = "pt_BR-faber-medium";

export type VoicePackId = "kokoro-en" | "piper-pt-br";

export type VoiceEntry = {
  id: string;
  name: string;
  language: string;
  gender: "Female" | "Male";
  grade?: string;
};

export type VoiceEngine = "kokoro" | "piper";

export type VoicePackMeta = {
  id: VoicePackId;
  engine: VoiceEngine;
  name: string;
  description: string;
  approxSizeMb: number;
  languages: string[];
  voices: VoiceEntry[];
  /** Modelo / voiceId de download runtime */
  downloadRef: string;
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
    downloadRef: KOKORO_MODEL_ID,
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
      "Piper WASM on-device — voz pt_BR-faber-medium (CC0, ~63 MB). Qualidade estável. Texto não sai do navegador.",
    approxSizeMb: 63,
    languages: ["pt-BR"],
    downloadRef: PIPER_PT_BR_VOICE_ID,
    voices: [
      {
        id: PIPER_PT_BR_VOICE_ID,
        name: "Faber (medium)",
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

export const DEFAULT_PACK_ID: VoicePackId = "piper-pt-br";
export const DEFAULT_VOICE_ID = PIPER_PT_BR_VOICE_ID;
