/**
 * Auditoria obrigatória de calls MCP (read e write).
 * Persiste em audit_events; nunca inclui tokens de conector nem Bearer.
 */

import { createHash } from "node:crypto";
import { auditEvents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { sanitizeError } from "@/lib/security/sanitize";

export type McpAuditInput = {
  userId: string;
  clientId: string;
  grantId?: string;
  tool: string;
  params: unknown;
  status: "ok" | "error" | "forbidden" | "rate_limited";
  latencyMs: number;
  errorMessage?: string;
};

export function hashParams(params: unknown): string {
  const raw = JSON.stringify(params ?? {});
  return createHash("sha256").update(raw).digest("hex");
}

export async function writeMcpAudit(input: McpAuditInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditEvents).values({
      userId: input.userId,
      type: "mcp.tool_call",
      payload: {
        client_id: input.clientId,
        grant_id: input.grantId ?? null,
        tool: input.tool,
        params_sha256: hashParams(input.params),
        status: input.status,
        latency_ms: input.latencyMs,
        // H3 — nenhum erro vai ao audit sem passar pelo sanitizador central.
        error: input.errorMessage ? sanitizeError(input.errorMessage, "erro") : null,
        ts: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[mcp.audit] failed to persist", e);
  }
}

/** Rate limit por grant: 30 calls / 60s (janela deslizante em memória de processo). */
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

export function checkMcpRateLimit(grantKey: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const key = grantKey || "anon";
  const prev = buckets.get(key) ?? [];
  const recent = prev.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    buckets.set(key, recent);
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
}

/** Test-only: limpa buckets. */
export function __resetMcpRateLimitForTests() {
  buckets.clear();
}
