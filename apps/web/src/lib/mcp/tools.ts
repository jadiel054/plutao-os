/**
 * Tools MCP do Plutão.
 * Read: mcp:read. Write (send_message): mcp:write no call time.
 * Tokens de conectores nunca saem nas respostas.
 */

import { and, desc, eq } from "drizzle-orm";
import { conversations, messages as messagesTable, missions, auditEvents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { listConnectorsForUser } from "@/lib/connectors/service";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelMessage } from "@/lib/runtime/model/types";
import { hasMcpScope, getMcpAuth } from "./auth";
import { checkMcpRateLimit, writeMcpAudit } from "./audit";
import { sanitizeTitle } from "@/lib/security/sanitize";
import { NIX_IDENTITY, OPERATOR_GOLDEN_RULE } from "@/lib/agente/operating-principles";
import { buildIdentityBlock, loadAgentIdentity } from "@/lib/agente/identity";
import { emitUserMessage, emitAssistantMessage } from "@/lib/events/appendConversationEvent";

const MAX_CONTENT = 4000;

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
    connectorsSummary = list.map((c) => ({
      provider: c.provider,
      status: c.status,
      account: c.accountLogin || c.accountLabel || null,
    }));
  } catch (e) {
    connectorsSummary = [
      {
        provider: "_",
        status: `error: ${e instanceof Error ? e.message : String(e)}`,
        account: null,
      },
    ];
  }

  const authLabel =
    authMethod === "oauth"
      ? "OAuth 2.1 access token (PKCE)"
      : authMethod === "ops_key"
        ? "ops API key (break-glass)"
        : "bearer API key";

  return textResult({
    product: "Plutão",
    role: "MCP surface",
    appUrl,
    // Decisão de produto: não vazar provider/model internos
    model: "plutao-primary",
    modelConfigured: hasModelKey,
    mcp: {
      phase: 2,
      auth: authLabel,
      writeTools: true,
      scopesSupported: ["mcp:read", "mcp:write"],
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

/**
 * Lista conversas do chat (tabela conversations) — persistência real do produto.
 * Missões legadas permanecem acessíveis via plutao_get_mission quando o id for conhecido.
 */
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
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
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
    return textResult({ error: "missionId obrigatório" }, true);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, id), eq(missions.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return textResult({ error: "Missão não encontrada ou sem permissão." }, true);
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

export type SendMessageInput = {
  content: string;
  conversationId?: string;
};

/**
 * Envia mensagem no pipeline de chat (conversas + messages).
 * Requer scope mcp:write. Sem conversationId cria conversa com source mcp.
 */
export async function toolSendMessage(userId: string, input: SendMessageInput) {
  if (!hasMcpScope("mcp:write")) {
    return textResult(
      {
        error: "forbidden",
        message:
          "Scope mcp:write ausente. Re-autorize o cliente incluindo mcp:write no consent OAuth.",
        hint: "scopes_supported: mcp:read mcp:write",
      },
      true
    );
  }

  // H5 — rate limit agora é aplicado no wrapper `withMcpGuards`, que cobre
  // TODAS as tools (antes só `plutao_send_message` era limitada).

  const content = String(input.content ?? "").trim();
  if (!content) {
    return textResult({ error: "content obrigatório" }, true);
  }
  if (content.length > MAX_CONTENT) {
    return textResult(
      { error: "content_too_long", message: `Máximo ${MAX_CONTENT} caracteres.` },
      true
    );
  }

  const db = getDb();
  let conversationId: string | null = null;
  const provided = input.conversationId?.trim() || null;

  if (provided) {
    const existing = await db
      .select({ id: conversations.id, userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, provided))
      .limit(1);
    if (!existing[0]) {
      return textResult({ error: "conversation_not_found" }, true);
    }
    if (existing[0].userId !== userId) {
      return textResult({ error: "forbidden", message: "Conversa de outro usuário." }, true);
    }
    conversationId = existing[0].id;
  } else {
    // H3 — título de conversa visível via MCP: sanitizado contra segredos.
    const title = sanitizeTitle(content.slice(0, 40)) || "MCP";
    const now = new Date();
    const created = await db
      .insert(conversations)
      .values({
        userId,
        title,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id });
    conversationId = created[0]?.id ?? null;
    if (!conversationId) {
      return textResult({ error: "failed_to_create_conversation" }, true);
    }
  }

  // Histórico recente para contexto
  const historyRows = await db
    .select({
      role: messagesTable.role,
      content: messagesTable.content,
    })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(20);

  const historyChrono = [...historyRows].reverse().filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  const modelConfig = getModelConfig();
  if (!modelConfig) {
    return textResult(
      { error: "model_unavailable", message: "Modelo não configurado no servidor." },
      true
    );
  }

  // Identidade compartilhada com o chat: antes o MCP respondia com uma persona
  // diferente ("Você é o Plutão, agente de execução") e sem os princípios operacionais.
  const agentProfile = await loadAgentIdentity(userId);
  const system: ModelMessage = {
    role: "system",
    content: [
      buildIdentityBlock(agentProfile) || NIX_IDENTITY,
      "Responda em português, de forma direta e profissional. Não exponha tokens, chaves ou detalhes internos de provedor/modelo.",
      OPERATOR_GOLDEN_RULE,
    ].join("\n\n"),
  };
  const modelMessages: ModelMessage[] = [
    system,
    ...historyChrono.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content },
  ];

  let assistantText = "";
  try {
    const result = await chatCompletion(modelConfig, modelMessages);
    assistantText = (result.content || "").trim() || "(sem resposta)";
  } catch (e) {
    return textResult(
      {
        error: "model_error",
        message: e instanceof Error ? e.message : String(e),
        conversationId,
      },
      true
    );
  }

  const now = new Date();
  const inserted = await db
    .insert(messagesTable)
    .values([
      {
        conversationId,
        role: "user",
        content,
        metadata: { source: "mcp", client_id: getMcpAuth().clientId },
        createdAt: now,
      },
      {
        conversationId,
        role: "assistant",
        content: assistantText,
        metadata: { source: "mcp" },
        createdAt: new Date(now.getTime() + 10),
      },
    ])
    .returning({ id: messagesTable.id, role: messagesTable.role });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  // H1: eventos sequenciais — user sempre seq menor que assistant.
  // Ainda fire-and-forget no total (não bloqueia a resposta MCP se o event log falhar),
  // mas a cadeia interna é await user → await assistant.
  void (async () => {
    try {
      await emitUserMessage(conversationId, content);
      await emitAssistantMessage(conversationId, assistantText);
    } catch (e) {
      console.error("[events send_message ordered]", e);
    }
  })();

  const userMsg = inserted.find((r) => r.role === "user");
  const asstMsg = inserted.find((r) => r.role === "assistant");

  return textResult({
    conversationId,
    userMessageId: userMsg?.id ?? null,
    assistantMessageId: asstMsg?.id ?? null,
    assistant: assistantText,
    source: "mcp",
  });
}

/** Wrapper de auditoria para handlers de tool. */
/**
 * H5 — guard aplicado a TODAS as tools MCP: rate limit por grant + auditoria.
 * Substitui o uso direto de `withMcpAudit` na rota.
 */
export async function withMcpGuards<T extends { content: unknown[]; isError?: boolean }>(
  tool: string,
  params: unknown,
  fn: () => Promise<T>
): Promise<T> {
  const auth = getMcpAuth();
  const grantKey = auth.grantId || auth.clientId || auth.userId;
  const rl = checkMcpRateLimit(grantKey);
  if (!rl.ok) {
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: "rate_limited",
      latencyMs: 0,
      errorMessage: `rate limit excedido (retryAfter=${rl.retryAfterSec}s)`,
    });
    return textResult(
      {
        error: "rate_limited",
        message: `Limite de 30 calls/min por grant. Tente em ~${rl.retryAfterSec}s.`,
        retryAfterSec: rl.retryAfterSec,
      },
      true
    ) as unknown as T;
  }
  return withMcpAudit(tool, params, fn);
}

export async function withMcpAudit<T extends { content: unknown[]; isError?: boolean }>(
  tool: string,
  params: unknown,
  fn: () => Promise<T>
): Promise<T> {
  const auth = getMcpAuth();
  const started = Date.now();
  try {
    const result = await fn();
    const status = result.isError ? "error" : "ok";
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status,
      latencyMs: Date.now() - started,
    });
    return result;
  } catch (e) {
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: "error",
      latencyMs: Date.now() - started,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

// silence unused import if tree-shaken in some builds
void auditEvents;
