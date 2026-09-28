/**
 * Scrub de segredos no write path do event stream.
 * Reutiliza detect/redact do módulo de credenciais + reforço para sk-test literal.
 */

import { redactSecrets } from "@/lib/security/credentials";

const EXTRA: Array<{ re: RegExp; replace: string }> = [
  // reforço explícito pedido em G1
  { re: /\bsk-test[A-Za-z0-9_\-]*/gi, replace: "[redacted]" },
  { re: /\bsk_test_[A-Za-z0-9]+/g, replace: "[redacted]" },
  { re: /\bghp_[A-Za-z0-9_]+/g, replace: "[redacted]" },
  { re: /\bsk-[A-Za-z0-9]{16,}/g, replace: "[redacted]" },
];

export function scrubText(input: string): string {
  if (!input) return input;
  let text = redactSecrets(input).text;
  for (const { re, replace } of EXTRA) {
    re.lastIndex = 0;
    text = text.replace(re, replace);
  }
  return text;
}

export function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v);
    }
    return out;
  }
  return value;
}

export function buildTruncatedPreview(
  full: string,
  head = 400,
  tail = 200
): { preview: string; charCount: number; truncated: boolean } {
  const charCount = full.length;
  if (charCount <= head + tail + 80) {
    return { preview: full, charCount, truncated: false };
  }
  const preview =
    full.slice(0, head) +
    `\n… [Full output (${charCount} chars) saved to artifact] …\n` +
    full.slice(-tail);
  return { preview, charCount, truncated: true };
}
