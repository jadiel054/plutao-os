/**
 * Sanitiza markdown/markup para TTS.
 * Remove artefatos que engines leem em voz alta (asterisco, hashtag, backticks).
 * Nunca retorna string vazia se a entrada tinha conteúdo — fallback: texto cru truncado.
 */

const MAX = 4000;

export function sanitizeForSpeech(text: string): string {
  const raw = typeof text === "string" ? text : String(text ?? "");
  if (!raw.trim()) return "";

  let s = raw;

  // Blocos de código fenced → verbalização curta
  s = s.replace(/```[\s\S]*?```/g, " código omitido ");
  // Inline code: mantém o conteúdo, tira backticks
  s = s.replace(/`([^`\n]+)`/g, "$1");
  s = s.replace(/`+/g, " ");

  // Imagens ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links [label](url) → label
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // URLs bare → "link"
  s = s.replace(/https?:\/\/[^\s)\]>"']+/gi, " link ");
  s = s.replace(/www\.[^\s)\]>"']+/gi, " link ");

  // Headers
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]*$/gm, "");

  // Bold / italic / strike (ordem: triplo → duplo → simples)
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  s = s.replace(/___([^_]+)___/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  // Itálico residual com * ou _ delimitando palavra
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2");

  // Marcadores de lista no início da linha
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");

  // Blockquotes
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");

  // Tabelas markdown: separadores
  s = s.replace(/\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?/g, " ");
  s = s.replace(/\|/g, " ");

  // HTML residual comum
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");

  // Símbolos markdown soltos que TTS soletra
  s = s.replace(/[*_~#`]+/g, " ");

  // Colapsa whitespace
  s = s.replace(/\s+/g, " ").trim();

  if (!s) {
    // Nunca colapsar a vazio se havia conteúdo
    const fallback = raw.replace(/\s+/g, " ").trim().slice(0, MAX);
    return fallback || " ";
  }

  return s.slice(0, MAX);
}
