/*
 * Tools MCP do Plutão.
 * Tokens de conectores nunca saem nas respostas. Escrita exige mcp:write consentido via OAuth.
 */

import { and, desc, eq } from "drizzle-orm";
import { conversations, messages as messagesTable, missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { listConnectorsForUser } from "@/lib/connectors/service";
import { getOwnedConversation } from "@/lib/missions/ownership";
import { createMissionRecord, MissionIdempotencyConflictError } from "@/lib/missions/createMissionRecord";
import { parseMissionIntake } from "@/lib/missions/intake";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelMessage } from "@/lib/runtime/model/types";
import { loadAgentIdentity, buildIdentityBlock } from "@/lib/agente/identity";
import { redactSecrets } from "@/lib/security/credentials";
import { sanitizeErrorForClient, sanitizeText, sanitizeTitle, stripInventedToolCalls } from "@/lib/security/sanitize";
import { persistMessagePair } from "@/lib/chat/persistChatMessages";
import { getMcpAuth } from "./auth";
import { checkMcpRateLimit, writeMcpAudit } from "./audit";

function textResult(payload: unknown, isError = false) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}

export async function toolSystemStatus(userId: string, authMethod?: "oauth" | "ops_key") {
  const auth = getMcpAuth();
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
      writeTools: auth.method === "oauth" && auth.scopes.includes("mcp:write"),
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

export type CreateMissionToolInput = {
  objective: string;
  context?: string;
  constraints?: string;
  definitionOfDone?: string;
  conversationId?: string;
  idempotencyKey: string;
};

/** Creates an owned mission in CREATED only; this does not enqueue or start execution. */
export async function toolCreateMission(userId: string, input: CreateMissionToolInput) {
  const textFields = [input.objective, input.context, input.constraints, input.definitionOfDone];
  if (textFields.some((value) => (value?.length ?? 0) > 4000) || input.objective.length > 1000) {
    return textResult({ error: "input_too_long", message: "Objetivo: até 1000 caracteres; os demais campos: até 4000." }, true);
  }

  const parsed = parseMissionIntake(
    {
      objective: sanitizeText(input.objective),
      context: input.context === undefined ? undefined : sanitizeText(input.context),
      constraints: input.constraints === undefined ? undefined : sanitizeText(input.constraints),
      definitionOfDone: input.definitionOfDone === undefined ? undefined : sanitizeText(input.definitionOfDone),
      source: "mcp",
      conversationId: input.conversationId,
      idempotencyKey: input.idempotencyKey,
    },
    null
  );
  if (!parsed.ok) return textResult({ error: parsed.error }, true);

  if (parsed.input.conversationId) {
    const conversation = await getOwnedConversation(parsed.input.conversationId, userId);
    if (!conversation) return textResult({ error: "conversation_not_found" }, true);
  }

  try {
    const created = await createMissionRecord(userId, parsed.input);
    if (!created.mission) return textResult({ error: "mission_creation_failed" }, true);
    return textResult({
      mission: created.mission,
      deduplicated: created.deduplicated,
      executionStarted: false,
      message: "Missão criada em CREATED. Ela não foi iniciada; revise e inicie pelo fluxo normal do Plutão.",
    });
  } catch (error) {
    if (error instanceof MissionIdempotencyConflictError) {
      return textResult({ error: "IDEMPOTENCY_KEY_REUSED", message: "A chave já foi usada para outra missão." }, true);
    }
    const safe = sanitizeErrorForClient(error, { fallback: "Não foi possível criar a missão." });
    return textResult({ error: "mission_creation_failed", message: safe.error, ref: safe.ref }, true);
  }
}

export type SendMessageToolInput = { content: string; conversationId?: string };

/** Text-only model conversation; it intentionally never invokes connector/tool runners. */
export async function toolSendMessage(userId: string, input: SendMessageToolInput) {
  const rawContent = String(input.content ?? "").trim();
  if (!rawContent) return textResult({ error: "content_required" }, true);
  const content = sanitizeText(redactSecrets(rawContent).text).trim();
  if (!content) return textResult({ error: "content_required" }, true);
  if (content.length > 4000) return textResult({ error: "content_too_long", maxCharacters: 4000 }, true);

  const modelConfig = getModelConfig();
  if (!modelConfig) return textResult({ error: "model_unavailable", message: "Modelo não configurado no servidor." }, true);

  try {
    const db = getDb();
    let conversationId: string | null = null;
    let history: ModelMessage[] = [];
    const providedConversationId = input.conversationId?.trim();

    if (providedConversationId) {
      const conversationRows = await db
        .select({ id: conversations.id, userId: conversations.userId })
        .from(conversations)
        .where(eq(conversations.id, providedConversationId))
        .limit(1);
      const conversation = conversationRows[0];
      if (!conversation || conversation.userId !== userId) {
        return textResult({ error: "conversation_not_found" }, true);
      }
      conversationId = conversation.id;
      const historyRows = await db
        .select({ role: messagesTable.role, content: messagesTable.content })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(desc(messagesTable.createdAt))
        .limit(20);
      history = historyRows
        .reverse()
        .filter((row) => (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
        .map((row) => ({ role: row.role as "user" | "assistant", content: sanitizeText(row.content) }));
    }

    const profile = await loadAgentIdentity(userId);
    const modelMessages: ModelMessage[] = [
      {
        role: "system",
        content: [
          buildIdentityBlock(profile),
          "Responda em português, de forma direta e profissional. Não revele credenciais ou detalhes internos do provedor.",
          "Esta ferramenta oferece somente conversa textual: não execute nem alegue ter executado ações de conectores, criação de missão ou mudanças externas. Para criar uma missão, use a ferramenta própria; ações externas permanecem nos fluxos de aprovação do Plutão.",
        ].join("\n\n"),
      },
      ...history,
      { role: "user", content },
    ];

    const completion = await chatCompletion(modelConfig, modelMessages);
    const assistant = sanitizeText(stripInventedToolCalls(completion.content.trim()) || "(sem resposta)");

    if (!conversationId) {
      const now = new Date();
      const created = await db
        .insert(conversations)
        .values({
          userId,
          title: sanitizeTitle(content.slice(0, 40)) || "MCP",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: conversations.id });
      conversationId = created[0]?.id ?? null;
      if (!conversationId) return textResult({ error: "failed_to_create_conversation" }, true);
    }

    await persistMessagePair(db, conversationId, content, assistant, {
      source: "mcp",
      client_id: getMcpAuth().clientId,
    });

    return textResult({
      conversationId,
      assistant,
      source: "mcp",
      connectorActionsExecuted: false,
    });
  } catch (error) {
    const safe = sanitizeErrorForClient(error, { fallback: "Não foi possível processar a mensagem." });
    return textResult({ error: "send_message_failed", message: safe.error, ref: safe.ref }, true);
  }
}

/** Rate limit and audit wrapper for every exposed tool, including writes. */
export async function withMcpGuards<T extends { content: unknown[]; isError?: boolean }>(
  tool: string,
  params: unknown,
  fn: () => Promise<T>,
  options: { requiredScope?: string } = {},
): Promise<T> {
  const auth = getMcpAuth();
  if (options.requiredScope && (auth.method !== "oauth" || !auth.scopes.includes(options.requiredScope))) {
    await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: "forbidden",
      latencyMs: 0,
      errorMessage: `scope ${options.requiredScope} ausente`,
    });
    return textResult({
      error: "forbidden",
      message: `Esta ferramenta exige autorização OAuth com ${options.requiredScope}. A chave operacional permanece somente leitura.`,
      requiredScope: options.requiredScope,
    }, true) as unknown as T;
  }

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

  if (options.requiredScope) {
    const auditStarted = await writeMcpAudit({
      userId: auth.userId,
      clientId: auth.clientId,
      grantId: auth.grantId,
      tool,
      params,
      status: "started",
      latencyMs: 0,
    });
    if (!auditStarted) {
      return textResult({
        error: "audit_unavailable",
        message: "A operação foi interrompida porque não foi possível registrar a auditoria.",
      }, true) as unknown as T;
    }
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
