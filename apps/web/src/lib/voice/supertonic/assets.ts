/**
 * Assets oficiais Supertonic 3 — Hugging Face Supertone/supertonic-3
 * (split opensource-multilingual, OpenRAIL pesos; web helper MIT:
 * github.com/supertone-inc/supertonic).
 *
 * Tamanhos medidos via Content-Length HEAD (2026-09-25, rev main):
 *   duration_predictor 3.7 MB · text_encoder 36.4 MB ·
 *   vector_estimator 256.5 MB · vocoder 101.4 MB ·
 *   tts.json + unicode_indexer ~0.3 MB → total ≈ 398 MB decimal.
 *
 * NÃO apontar para Supertone/supertonic (EN / opensource-en).
 */

import {
  SUPERTONIC_HF_REPO,
  SUPERTONIC_HF_REVISION,
  SUPERTONIC_PACK_SIZE_MB,
} from "../packs";

/** Bump v1→v2: isolation obrigatória após troca EN→multilingual. */
export const SUPERTONIC_CACHE = "plutao-supertonic-v2";

export const SUPERTONIC_VOICE_IDS = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
] as const;

export type SupertonicVoiceId = (typeof SUPERTONIC_VOICE_IDS)[number];

/** Caminhos relativos no repo HF. */
export const SUPERTONIC_ONNX_FILES = [
  "onnx/duration_predictor.onnx",
  "onnx/text_encoder.onnx",
  "onnx/vector_estimator.onnx",
  "onnx/vocoder.onnx",
  "onnx/tts.json",
  "onnx/unicode_indexer.json",
] as const;

export function hfUrl(relPath: string): string {
  return `https://huggingface.co/${SUPERTONIC_HF_REPO}/resolve/${SUPERTONIC_HF_REVISION}/${relPath}`;
}

export function voiceStyleRel(id: string): string {
  return `voice_styles/${id}.json`;
}

export { SUPERTONIC_PACK_SIZE_MB };
