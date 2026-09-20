/**
 * Detecção e mascaramento de credenciais sensíveis no chat e no runtime.
 * Nunca persistir o valor completo na UI; o modelo recebe versão redacted.
 */

export type SecretHit = {
  kind: string;
  /** trecho mascarado ex.: sk_live_****abcd */
  masked: string;
  start: number;
  end: number;
};

/** Padrões oficiais / comuns — ordem importa (mais específicos primeiro). */
const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "stripe_secret", re: /\b(sk_live|sk_test|rk_live|rk_test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "stripe_pub", re: /\b(pk_live|pk_test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "github_pat", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { kind: "github_fine", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: "vercel_token", re: /\b(vcp_|vca_|vcr_)[A-Za-z0-9]{16,}\b/g },
  { kind: "aws_key", re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { kind: "openai_key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { kind: "google_api", re: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  { kind: "bearer_long", re: /\bBearer\s+([A-Za-z0-9\-_\.]{24,})\b/gi },
  {
    kind: "labeled_key",
    re: /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key|client[_-]?secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-\.]{20,})['"]?/gi,
  },
  { kind: "long_token", re: /(?<![A-Za-z0-9_\-])([A-Za-z0-9_\-]{40,})(?![A-Za-z0-9_\-])/g },
];

function maskValue(raw: string, kind: string): string {
  const clean = raw.replace(/^Bearer\s+/i, "");
  if (clean.length <= 8) return "****";
  const prefix =
    kind === "stripe_secret" || kind === "stripe_pub"
      ? clean.slice(0, Math.min(12, clean.indexOf("_") + 1 + 4))
      : clean.slice(0, Math.min(8, Math.floor(clean.length * 0.25)));
  const suffix = clean.slice(-4);
  return `${prefix}****${suffix}`;
}

/**
 * Encontra credenciais candidatas no texto.
 */
export function detectSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const seen = new Set<string>();

  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const full = m[0];
      const capture = m[1] && (kind === "labeled_key" || kind === "bearer_long") ? m[1] : full;
      const value = capture;

      if (kind === "long_token") {
        const lineStart = text.lastIndexOf("\n", m.index) + 1;
        const lineEnd = text.indexOf("\n", m.index);
        const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).toLowerCase();
        const contextOk =
          /api|key|token|secret|password|credential|bearer|auth|neon|exa|vercel|render|stripe|github/.test(
            line
          ) || text.trim().length < 80;
        if (!contextOk) continue;
        if (/^[a-f0-9]{40}$/i.test(value) && !/key|token|secret/.test(line)) continue;
      }

      const key = `${m.index}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const valueStart =
        kind === "labeled_key" || kind === "bearer_long" ? m.index + full.indexOf(value) : m.index;
      hits.push({
        kind,
        masked: maskValue(value, kind),
        start: valueStart,
        end: valueStart + value.length,
      });
    }
  }

  return hits.sort((a, b) => a.start - b.start);
}

/** Substitui valores sensíveis por máscara estável (para UI e para o modelo). */
export function redactSecrets(text: string): { text: string; hits: SecretHit[]; hadSecrets: boolean } {
  const hits = detectSecrets(text);
  if (hits.length === 0) return { text, hits, hadSecrets: false };

  let out = "";
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    out += text.slice(cursor, h.start);
    out += h.masked;
    cursor = h.end;
  }
  out += text.slice(cursor);
  return { text: out, hits, hadSecrets: true };
}

/** Texto de alerta quando credencial apareceu no chat. */
export function secretExposureNotice(hits: SecretHit[]): string {
  const kinds = [...new Set(hits.map((h) => h.kind))].join(", ");
  return (
    `Seguranca: detectei possivel(is) credencial(is) no chat (${kinds}). ` +
    `O valor foi mascarado na interface e no contexto do modelo. ` +
    `Quando a tarefa terminar, revogue a chave no painel do provedor se ela foi exposta em texto claro.`
  );
}
