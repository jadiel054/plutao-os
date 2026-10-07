/**
 * Auditoria obrigatória de calls MCP (read e write).
 * Persiste em audit_events; nunca inclui tokens de conector nem Bearer.
 */

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { auditEvents, rateLimitBuckets } from "@plutao/db";
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

/** Rate limit por grant: 30 calls / 60s, persistido e atômico no Neon. */
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;

export async function checkMcpRateLimit(
  grantKey: string
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = new Date();
  const key = grantKey || "anon";
  const db = getDb();
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStartedAt: now, hits: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        windowStartedAt: sql`CASE WHEN ${rateLimitBuckets.windowStartedAt} <= now() - interval '60 seconds' THEN now() ELSE ${rateLimitBuckets.windowStartedAt} END`,
        hits: sql`CASE WHEN ${rateLimitBuckets.windowStartedAt} <= now() - interval '60 seconds' THEN 1 ELSE ${rateLimitBuckets.hits} + 1 END`,
        updatedAt: now,
      },
    })
    .returning({ windowStartedAt: rateLimitBuckets.windowStartedAt, hits: rateLimitBuckets.hits });
  const bucket = rows[0];
  if (!bucket || bucket.hits <= RATE_LIMIT) return { ok: true };
  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - bucket.windowStartedAt.getTime())) / 1000));
  return { ok: false, retryAfterSec };
}

/** Mantida para compatibilidade dos testes; buckets reais vivem no Neon. */
export function __resetMcpRateLimitForTests() {}
