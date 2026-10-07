/**
 * H3 — Sanitizador central único de segredos.
 *
 * REGRA DE OURO: nenhum valor sensível sai do servidor sem passar por aqui.
 * Pontos de aplicação obrigatórios:
 *   1. `console.*` (logs de servidor)
 *   2. trace de tool (`trace.input` / `trace.output`) — chat SSE + evidence de missão
 *   3. audit do MCP (`audit_events.payload.error`)
 *   4. resposta de erro ao cliente (`emit("error")`, `NextResponse.json({error})`)
 *   5. título de conversa (visível via `plutao_list_conversations`)
 *
 * Este módulo é a ÚNICA porta de saída. `scrub.ts` (write path do event log)
 * reexporta `sanitizeText` para manter uma implementação só.
 */

import { redactSecrets } from "./credentials";

/**
 * Padrões que o detector genérico de credenciais não cobre ou cobre de forma
 * parcial (tokens de provedores que o Plutão suporta + DSNs).
 */
const EXTRA_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /\bsk-test[A-Za-z0-9_\-]*/gi, replace: "[redacted]" },
  { re: /\bsk_test_[A-Za-z0-9]+/g, replace: "[redacted]" },
  { re: /\bsk_live_[A-Za-z0-9]+/g, replace: "[redacted]" },
  { re: /\bsk-[A-Za-z0-9]{16,}/g, replace: "[redacted]" },
  { re: /\bghp_[A-Za-z0-9_]+/g, replace: "[redacted]" },
  { re: /\bgithub_pat_[A-Za-z0-9_]+/g, replace: "[redacted]" },
  { re: /\bnpg_[A-Za-z0-9_]+/g, replace: "[redacted]" },
  { re: /\bsbp_[A-Za-z0-9_]+/g, replace: "[redacted]" },
  { re: /\brnd_[A-Za-z0-9_]+/g, replace: "[redacted]" },
  { re: /\bprt_[A-Za-z0-9_\-]+/g, replace: "[redacted]" },
  { re: /\bvcp_[A-Za-z0-9]{12,}/g, replace: "[redacted]" },
  { re: /\bAIza[0-9A-Za-z\-_]{20,}/g, replace: "[redacted]" },
  // Telegram bot token: <bot-id>:<secret>.
  { re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g, replace: "[redacted]" },
  // JWT compacto (inclusive tokens que não são Bearer).
  { re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replace: "[redacted-jwt]" },
  // AWS access key IDs.
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[redacted]" },
  // Cloudflare tokens frequently appear only as a value of a named field.
  { re: /((?:cloudflare|cf)[A-Za-z0-9_-]*(?:token|secret|key)\s*[:=]\s*)[A-Za-z0-9._-]{24,}/gi, replace: "$1[redacted]" },
  // DSN Postgres/Neon com senha embutida
  { re: /\b(?:postgres|postgresql):\/\/[^\s"'`]+/gi, replace: "[redacted-dsn]" },
  // Authorization header em texto
  { re: /\bBearer\s+[A-Za-z0-9\-_\.=]{12,}/gi, replace: "Bearer [redacted]" },
];

/**
 * Chaves de objeto cujo VALOR é tratado como sensível por natureza,
 * independentemente do formato do valor (ex.: `{ key: "STRIPE_KEY", value: "..." }`).
 */
export const SENSITIVE_KEY_RE =
  /(pass(word|phrase)?|secret|token|api[_-]?key|apikey|authorization|credential|private[_-]?key|service[_-]?role|dsn|connection[_-]?string|database[_-]?url|access[_-]?key|session[_-]?id|cookie)/i;

/** Valores textuais não reconhecíveis por padrão (ex.: `value` de env_set). */
export const DEFAULT_EXTRA_SENSITIVE_KEYS = ["value"] as const;

export type SanitizeOptions = {
  /**
   * Chaves adicionais (além de `SENSITIVE_KEY_RE`) cujo valor deve ser mascarado.
   * Use para payloads com semântica conhecida (ex.: `value` de env_set).
   */
  extraSensitiveKeys?: readonly string[];
  /** Substitui o mascaramento por `[redacted]` (útil em logs). */
  maskAsRedacted?: boolean;
  /** Profundidade máxima de recursão (padrão 8). */
  maxDepth?: number;
};

/** Máscara estável `ab***yz` — mesma semântica usada nos previews de gate. */
export function maskSecret(value: string): string {
  const clean = value.trim();
  if (clean.length <= 4) return "****";
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

/**
 * Sanitiza um texto: remove credenciais reconhecíveis por padrão e DSNs.
 * Idempotente e seguro para strings vazias.
 */
export function sanitizeText(input: unknown): string {
  if (input == null) return "";
  let text = typeof input === "string" ? input : String(input);
  if (!text) return text;
  text = redactSecrets(text).text;
  for (const { re, replace } of EXTRA_PATTERNS) {
    re.lastIndex = 0;
    text = text.replace(re, replace);
  }
  return text;
}

/**
 * Sanitiza recursivamente um valor arbitrário.
 * - strings → `sanitizeText`
 * - objetos → valores cujas chaves batem em `SENSITIVE_KEY_RE` (ou nas chaves extras) são mascarados
 * - arrays → recursão elemento a elemento
 */
export function sanitizeValue<T>(value: T, opts: SanitizeOptions = {}): T {
  const extra = new Set(
    (opts.extraSensitiveKeys ?? []).map((k) => k.toLowerCase())
  );
  const maxDepth = opts.maxDepth ?? 8;

  const walk = (node: unknown, depth: number, key?: string): unknown => {
    if (node == null) return node;

    if (typeof node === "string") {
      if (key && (extra.has(key.toLowerCase()) || SENSITIVE_KEY_RE.test(key))) {
        return opts.maskAsRedacted ? "[redacted]" : maskSecret(node);
      }
      return sanitizeText(node);
    }

    if (typeof node !== "object") return node;
    if (depth >= maxDepth) return "[truncated]";

    if (Array.isArray(node)) {
      return node.map((item) => walk(item, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = walk(v, depth + 1, k);
    }
    return out;
  };

  return walk(value, 0) as T;
}

/**
 * Mensagem de erro pronta para log: sem stack, sem segredo, com limite de tamanho.
 */
export function sanitizeError(error: unknown, fallback = "Erro inesperado"): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error == null
          ? fallback
          : safeStringify(error);
  const clean = sanitizeText(raw).replace(/\s+/g, " ").trim();
  return (clean || fallback).slice(0, 500);
}

/**
 * Erro seguro para o cliente: mensagem genérica + referência curta para correlacionar
 * com o log do servidor. Nunca devolve `err.message` cru.
 */
export function sanitizeErrorForClient(
  error: unknown,
  opts: { fallback?: string; ref?: string } = {}
): { error: string; ref: string } {
  const ref = opts.ref ?? shortRef(error);
  const fallback = opts.fallback ?? "Falha ao processar a requisição. Tente novamente.";
  // Mantém mensagens de domínio curtas e sem stack; se houver segredo, cai no fallback.
  const candidate = error instanceof Error ? error.message : "";
  const clean = sanitizeText(candidate).replace(/\s+/g, " ").trim();
  const looksSafe =
    clean.length > 0 &&
    clean.length <= 200 &&
    !clean.includes("\n") &&
    !/at\s+\w+\s+\(/.test(clean) &&
    clean === candidate.replace(/\s+/g, " ").trim();
  return { error: looksSafe ? clean : fallback, ref };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function shortRef(error: unknown): string {
  const seed = sanitizeText(error instanceof Error ? error.message : String(error ?? ""));
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `err_${(hash >>> 0).toString(36)}`;
}

/**
 * Título de conversa: sanitizado, sem quebras de linha, truncado.
 * Impede que um segredo colado no chat apareça em `plutao_list_conversations`.
 */
export function sanitizeTitle(raw: unknown, maxLen = 200): string {
  const clean = sanitizeText(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean.slice(0, maxLen);
}
