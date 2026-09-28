/**
 * Sanitiza markdown/markup para TTS.
 * Remove artefatos que engines leem em voz alta (asterisco, hashtag, backticks).
 * Nunca retorna string vazia se a entrada tinha conteúdo — fallback: texto cru truncado.
 */

const MAX = 4000;

/** Image bang-bracket alt -> alt (RegExp built without markdown in comments) */
const RE_IMAGE = new RegExp("!" + "\\[([^\\]]*)\\]\\([^)]*\\)", "g");
/** Link bracket label -> label */
const RE_LINK = new RegExp("\\[([^\\]]+)\\]\\([^)]*\\)", "g");

export function sanitizeForSpeech(text: string): string {
  const raw = typeof text === "string" ? text : String(text ?? "");
  if (!raw.trim()) return "";

  let s = raw;

  // Fenced code blocks -> short spoken placeholder
  s = s.replace(/```[\s\S]*?```/g, " código omitido ");
  // Inline code: keep content, drop backticks
  s = s.replace(/`([^`\n]+)`/g, "$1");
  s = s.replace(/`+/g, " ");

  // Images then links (order matters: images start with bang)
  s = s.replace(RE_IMAGE, "$1");
  s = s.replace(RE_LINK, "$1");

  // Bare URLs -> "link"
  s = s.replace(/https?:\/\/[^\s)\]>"']+/gi, " link ");
  s = s.replace(/www\.[^\s)\]>"']+/gi, " link ");

  // Headers
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]*$/gm, "");

  // Bold / italic / strike (triple -> double -> single)
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  s = s.replace(/___([^_]+)___/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2");

  // List markers at line start
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");

  // Blockquotes
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");

  // Table separators
  s = s.replace(/\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?/g, " ");
  s = s.replace(/\|/g, " ");

  // Residual HTML
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");

  // Stray markdown symbols TTS would spell out
  s = s.replace(/[*_~#`]+/g, " ");

  s = s.replace(/\s+/g, " ").trim();

  if (!s) {
    const fallback = raw.replace(/\s+/g, " ").trim().slice(0, MAX);
    return fallback || " ";
  }

  return s.slice(0, MAX);
}
