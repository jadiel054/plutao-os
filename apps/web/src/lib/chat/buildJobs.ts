/**
 * Execução durável da criação no Chat (kind "chat_build").
 *
 * Conecta o fluxo de criação do Chat à fila durável existente (runtime_jobs),
 * SEM transformar a criação em missão do Cockpit: missionId e executionId são
 * nulos; o estado do build (iterações, arquivos, contexto de tools) vive no
 * payload do job e é atualizado a cada fatia de orçamento (checkpoint).
 *
 * Migration 0035 (aplicação manual no Neon pelo mantenedor) torna mission_id e
 * execution_id nullable e cria índice único parcial para idempotência de
 * builds ativos por usuário+conversa.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { runtimeJobs, writeGates } from "@plutao/db";
import { getDb } from "@/lib/db";
import { sanitizeError } from "@/lib/security/sanitize";
import {
  CHAT_BUILD_PLAN_CAPABILITY,
  CHAT_BUILD_PLAN_PROVIDER,
  createChatBuildPlanGate,
  formatChatBuildPlan,
  generateChatBuildPlan,
  type ChatBuildPlan,
} from "./buildPlan";
import type { ModelConfig } from "@/lib/runtime/model/types";
import type { PersistedChatBuildState } from "./buildRunner";

export const CHAT_BUILD_JOB_KIND = "chat_build";

export type ChatBuildJobPayload = {
  conversationId: string;
  gateId: string | null;
  plan: ChatBuildPlan | null;
  userText: string;
  buildState: PersistedChatBuildState | null;
};

export function parseChatBuildJobPayload(raw: unknown): ChatBuildJobPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const conversationId = typeof rec.conversationId === "string" ? rec.conversationId : "";
  if (!conversationId) return null;
  const plan = rec.plan && typeof rec.plan === "object" ? (rec.plan as ChatBuildPlan) : null;
  const buildState =
    rec.buildState && typeof rec.buildState === "object"
      ? (rec.buildState as PersistedChatBuildState)
      : null;
  return {
    conversationId,
    gateId: typeof rec.gateId === "string" ? rec.gateId : null,
    plan,
    userText: typeof rec.userText === "string" ? rec.userText : "",
    buildState,
  };
}

const ACTIVE_STATUSES = ["PENDING", "RUNNING", "WAITING_APPROVAL"] as const;

export async function getActiveChatBuildJob(userId: string, conversationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(runtimeJobs)
    .where(
      and(
        eq(runtimeJobs.userId, userId),
        eq(runtimeJobs.kind, CHAT_BUILD_JOB_KIND),
        inArray(runtimeJobs.status, [...ACTIVE_STATUSES]),
        sql`${runtimeJobs.payload}->>'conversationId' = ${conversationId}`
      )
    )
    .orderBy(desc(runtimeJobs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Enfileira um job durável de criação no Chat. Idempotente: se já existe um
 * build ativo para usuário+conversa (índice único parcial da migration 0035),
 * o job existente é retornado sem duplicação.
 */
export async function enqueueChatBuildJob(opts: {
  userId: string;
  conversationId: string;
  gateId: string;
  plan: ChatBuildPlan | null;
  userText: string;
}) {
  const existing = await getActiveChatBuildJob(opts.userId, opts.conversationId);
  if (existing) return { job: existing, created: false as const };
  const payload: ChatBuildJobPayload = {
    conversationId: opts.conversationId,
    gateId: opts.gateId,
    plan: opts.plan,
    userText: opts.userText,
    buildState: null,
  };
  const db = getDb();
  const inserted = await db
    .insert(runtimeJobs)
    .values({
      userId: opts.userId,
      missionId: null,
      executionId: null,
      kind: CHAT_BUILD_JOB_KIND,
      status: "PENDING",
      payload,
      maxAttempts: 10,
      availableAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  const job = inserted[0] ?? (await getActiveChatBuildJob(opts.userId, opts.conversationId));
  if (!job) throw new Error("CHAT_BUILD_JOB_NOT_CREATED");
  return { job, created: true as const };
}

/** Checkpoint: substitui o payload do job com o estado mais recente do build. */
export async function updateChatBuildJobState(jobId: string, payload: ChatBuildJobPayload) {
  const db = getDb();
  const [job] = await db
    .update(runtimeJobs)
    .set({ payload, updatedAt: new Date() })
    .where(eq(runtimeJobs.id, jobId))
    .returning();
  return job ?? null;
}

export async function getPendingPlanGate(userId: string, conversationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(writeGates)
    .where(
      and(
        eq(writeGates.userId, userId),
        eq(writeGates.provider, CHAT_BUILD_PLAN_PROVIDER),
        eq(writeGates.capability, CHAT_BUILD_PLAN_CAPABILITY),
        eq(writeGates.target, conversationId),
        eq(writeGates.status, "pending")
      )
    )
    .orderBy(desc(writeGates.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Gate de plano aprovado sem job enfileirado (recuperação pós-falha). */
export async function getApprovedPlanGate(userId: string, conversationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(writeGates)
    .where(
      and(
        eq(writeGates.userId, userId),
        eq(writeGates.provider, CHAT_BUILD_PLAN_PROVIDER),
        eq(writeGates.capability, CHAT_BUILD_PLAN_CAPABILITY),
        eq(writeGates.target, conversationId),
        eq(writeGates.status, "approved")
      )
    )
    .orderBy(desc(writeGates.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export type ChatBuildRequestOutcome =
  | { mode: "plan_created"; gateId: string; planText: string }
  | { mode: "awaiting_approval"; gateId: string }
  | { mode: "queued"; jobId: string }
  | { mode: "skipped"; notice: string };

/**
 * Orquestração do ciclo de vida do build no Chat:
 *  - job ativo → execução durável já em andamento (nada duplicado);
 *  - gate pendente → aguardando aprovação (NENHUMA tool roda);
 *  - gate aprovado sem job → recuperação: enfileira o job;
 *  - caso novo → gera plano e cria o gate de aprovação.
 */
export async function handleChatBuildRequest(opts: {
  userId: string;
  conversationId: string | null;
  userText: string;
  history: Array<{ role: string; content: string }>;
  modelConfig: ModelConfig;
  connectorBlock?: string;
}): Promise<ChatBuildRequestOutcome> {
  const conversationId = opts.conversationId;
  if (!conversationId) {
    return { mode: "skipped", notice: "RUNTIME NOTICE: a criação no Chat requer uma conversa ativa." };
  }

  const active = await getActiveChatBuildJob(opts.userId, conversationId);
  if (active) {
    return { mode: "queued", jobId: active.id };
  }

  const pendingGate = await getPendingPlanGate(opts.userId, conversationId);
  if (pendingGate) {
    return { mode: "awaiting_approval", gateId: pendingGate.id };
  }

  const approvedGate = await getApprovedPlanGate(opts.userId, conversationId);
  if (approvedGate) {
    const gatePayload = (approvedGate.payload || {}) as {
      conversationId?: string;
      plan?: ChatBuildPlan;
      userText?: string;
    };
    try {
      const enqueued = await enqueueChatBuildJob({
        userId: opts.userId,
        conversationId,
        gateId: approvedGate.id,
        plan: gatePayload.plan ?? null,
        userText: gatePayload.userText ?? opts.userText,
      });
      return { mode: "queued", jobId: enqueued.job.id };
    } catch (e) {
      return {
        mode: "skipped",
        notice: "RUNTIME NOTICE: falha ao retomar a execução durável do plano aprovado: " + sanitizeError(e),
      };
    }
  }

  let plan: ChatBuildPlan | null = null;
  try {
    plan = await generateChatBuildPlan(opts);
  } catch (e) {
    return { mode: "skipped", notice: "Falha ao gerar o plano de criação: " + sanitizeError(e) };
  }
  if (!plan) {
    return {
      mode: "skipped",
      notice: "Falha ao gerar o plano de criação (resposta do modelo sem o JSON esperado).",
    };
  }

  const gate = await createChatBuildPlanGate({ userId: opts.userId, conversationId, plan });
  return { mode: "plan_created", gateId: gate.id, planText: formatChatBuildPlan(plan) };
}
