/**
 * Tools MCP do Plutão — Fase 1 (somente leitura / diagnóstico).
 * Writes (send_message, run_test) entram depois com gate de confirmação.
 */

import { and, desc, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { listConnectorsForUser } from "@/lib/connectors/service";

function textResult(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

export async function toolSystemStatus(userId: string, authMethod?: "oauth" | "ops_key") {
  const modelProvider = process.env.MODEL_PROVIDER || "(default xai)";
  const modelName = process.env.MODEL_NAME || "(default por provider)";
  const hasModelKey = Boolean(process.env.MODEL_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || process.env.XAI_API_KEY?.trim());
  const appUrl = process.env.APP_URL || "(não definido)";

  let connectorsSummary: { provider: string; status: string; account: string | null }[] = [];
  try {
    const list = await listConnectorsForUser(userId);
    connectorsSummary = list.map((c) => ({
      provider: c.provider,
      status: c.status,
      account: c.accountLogin || c.accountLabel || null,
    }));
  } catch (e) {
    connectorsSummary = [{ provider: "_", status: `error: ${e instanceof Error ? e.message : String(e)}`, account: null }];
  }

  const authLabel =
    authMethod === "oauth"
      ? "OAuth 2.1 access token (PKCE)"
      : authMethod === "ops_key"
        ? "ops API key (break-glass)"
        : "bearer API key";

  return textResult({
    product: "Plutão",
    role: "MCP audit surface (Phase 1 read-only)",
    appUrl,
    model: {
      providerEnv: modelProvider,
      nameEnv: modelName,
      apiKeyConfigured: hasModelKey,
      // nunca expõe a chave
    },
    mcp: {
      phase: 1,
      auth: authLabel,
      writeTools: false,
    },
    connectors: connectorsSummary,
    userIdBound: true,
  });
}

export async function toolListConnectors(userId: string) {
  const list = await listConnectorsForUser(userId);
  return textResult({
    count: list.length,
    connectors: list.map((c) => ({
      provider: c.provider,
      displayName: c.displayName,
      status: c.status,
      accountLogin: c.accountLogin,
      accountLabel: c.accountLabel,
      scopes: c.scopes,
      capabilities: c.capabilities.map((cap) => ({
        name: cap.name,
        mode: cap.mode,
        kind: cap.kind,
      })),
      lastError: c.lastError,
      connectedAt: c.connectedAt,
      updatedAt: c.updatedAt,
    })),
  });
}

export async function toolListConversations(userId: string, limit = 20) {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const db = getDb();
  const rows = await db
    .select({
      id: missions.id,
      objective: missions.objective,
      status: missions.status,
      currentState: missions.currentState,
      isPinned: missions.isPinned,
      projectId: missions.projectId,
      createdAt: missions.createdAt,
      updatedAt: missions.updatedAt,
    })
    .from(missions)
    .where(eq(missions.userId, userId))
    .orderBy(desc(missions.isPinned), desc(missions.updatedAt))
    .limit(safeLimit);

  return textResult({
    count: rows.length,
    conversations: rows.map((r) => ({
      id: r.id,
      objective: r.objective,
      status: r.status,
      currentState: r.currentState,
      isPinned: r.isPinned,
      projectId: r.projectId,
      createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
      updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
    })),
  });
}

export async function toolGetMission(userId: string, missionId: string) {
  const id = missionId.trim();
  if (!id) {
    return textResult({ error: "missionId obrigatório" });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, id), eq(missions.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return textResult({ error: "Missão não encontrada ou sem permissão." });
  }

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
