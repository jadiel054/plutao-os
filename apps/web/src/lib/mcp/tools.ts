/**
 * Tools MCP read-only do Plutão.
 * Tokens de conectores nunca saem nas respostas.
 */

import { and, desc, eq } from "drizzle-orm";
import { conversations, missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { listConnectorsForUser } from "@/lib/connectors/service";
import { getMcpAuth } from "./auth";
import { checkMcpRateLimit, writeMcpAudit } from "./audit";

function textResult(payload: unknown, isError = false) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}

export async function toolSystemStatus(userId: string, authMethod?: "oauth" | "ops_key") {
  const hasModelKey = Boolean(
    process.env.MODEL_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.XAI_API_KEY?.trim()
  );
  const appUrl = process.env.APP_URL || "(não definido)";

  let connectorsSummary: { provider: string; status: string; account: string | null }[] = [];
  try {
    const list = await listConnectorsForUser(userId);
    connectorsSummary = list.map((connector) => ({
      provider: connector.provider,
      status: connector.status,
      account: connector.accountLogin || connector.accountLabel || null,
    }));
  } catch (error) {
    connectorsSummary = [
      {
        provider: "_",
        status: `error: ${error instanceof Error ? error.message : String(error)}`,
        account: null,
      },
    ];
  }

  const authLabel =
    authMethod === "oauth"
      ? "OAuth 2.1 access token (PKCE)"
      : authMethod === "ops_key"
        ? "ops API key (read-only)"
        : "bearer API key (read-only)";

  return textResult({
    product: "Plutão",
    role: "MCP surface",
    appUrl,
    model: "plutao-primary",
    modelConfigured: hasModelKey,
    mcp: {
      phase: 2,
      auth: authLabel,
      writeTools: false,
      scopesSupported: ["mcp:read"],
    },
    connectors: connectorsSummary,
    userIdBound: true,
  });
}

export async function toolListConnectors(userId: string) {
  const list = await listConnectorsForUser(userId);
  return textResult({
    count: list.length,
    connectors: list.map((connector) => ({
      provider: connector.provider,
      displayName: connector.displayName,
      status: connector.status,
      accountLogin: connector.accountLogin,
      accountLabel: connector.accountLabel,
      scopes: connector.scopes,
      capabilities: connector.capabilities.map((capability) => ({
        name: capability.name,
        mode: capability.mode,
        kind: capability.kind,
      })),
      lastError: connector.lastError,
      connectedAt: connector.connectedAt,
      updatedAt: connector.updatedAt,
    })),
  });
}

/** Lista conversas do chat — somente registros pertencentes ao usuário autenticado. */
export async function toolListConversations(userId: string, limit = 20) {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const db = getDb();
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      isPinned: conversations.isPinned,
      projectId: conversations.projectId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.isPinned), desc(conversations.updatedAt))
    .limit(safeLimit);

  return textResult({
    count: rows.length,
    conversations: rows.map((row) => ({
      id: row.id,
      title: row.title,
      isPinned: row.isPinned,
      projectId: row.projectId,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    })),
  });
}

export async function toolGetMission(userId: string, missionId: string) {
  const id = missionId.trim();
  if (!id) return textResult({ error: "missionId obrigatório" }, true);

  const db = getDb();
  const rows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, id), eq(missions.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return textResult({ error: "Missão não encontrada ou sem permissão." }, true);

  return textResult({
    id: row.id,
    objective: row.objective,
    context: row.context,
    constraints: row.constraints,
    definitionOfDone: row.definitionOfDone,
    status: row.status,
    currentState: row.currentState,
    plan: row.plan,
    completedSteps: row.completedSteps,
    pendingSteps: row.pendingSteps,
    evidence: row.evidence,
    errors: row.errors,
    decisions: row.decisions,
    isPinned: row.isPinned,
    shareToken: row.shareToken ? "[present]" : null,
    projectId: row.projectId,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  });
}

/** Rate limit and audit wrapper for every exposed read tool. */
export async function withMcpGuards<T extends { content: unknown[]; isError?: boolean }>(
  tool: string,
  params: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const auth = getMcpAuth();
  const grantKey = auth.grantId || auth.clientId || auth.userId;
  const rateLimit = await checkMcpRateLimit(grantKey);
  if (!rateLimit.ok) {
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: "rate_limited",
      latencyMs: 0,
      errorMessage: `rate limit excedido (retryAfter=${rateLimit.retryAfterSec}s)`,
    });
    return textResult({
      error: "rate_limited",
      message: `Limite de 30 calls/min por grant. Tente em ~${rateLimit.retryAfterSec}s.`,
      retryAfterSec: rateLimit.retryAfterSec,
    }, true) as unknown as T;
  }
  return withMcpAudit(tool, params, fn);
}

async function withMcpAudit<T extends { content: unknown[]; isError?: boolean }>(
  tool: string,
  params: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const auth = getMcpAuth();
  const started = Date.now();
  try {
    const result = await fn();
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: result.isError ? "error" : "ok",
      latencyMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: "error",
      latencyMs: Date.now() - started,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
