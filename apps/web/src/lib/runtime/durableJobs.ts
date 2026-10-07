import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { executions, runtimeJobs } from "@plutao/db";
import { getDb } from "@/lib/db";
import { sanitizeError } from "@/lib/security/sanitize";
import { queueExecution } from "./service";

export const RUNTIME_JOB_LEASE_MS = 8 * 60 * 1000;
export const RUNTIME_JOB_RETRY_DELAY_MS = 30 * 1000;
export const RUNTIME_JOB_MAX_ATTEMPTS = 5;

export type RuntimeJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type RuntimeJobTerminalStatus = "SUCCEEDED" | "FAILED" | "CANCELLED";

export type RuntimeJobPayload = {
  currentTaskId?: string | null;
  conversationId?: string | null;
  maxIterations?: number;
  requestId?: string | null;
};

export type RuntimeJobOutcome =
  | { action: "succeed"; status: "SUCCEEDED"; reason: string }
  | { action: "cancel"; status: "CANCELLED"; reason: string }
  | { action: "retry"; status: "FAILED" | "PENDING"; reason: string };

function asPayload(raw: unknown): RuntimeJobPayload {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  return {
    currentTaskId: typeof value.currentTaskId === "string" ? value.currentTaskId : null,
    conversationId: typeof value.conversationId === "string" ? value.conversationId : null,
    maxIterations: typeof value.maxIterations === "number" ? value.maxIterations : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : null,
  };
}

/**
 * A execução do job é bem-sucedida somente quando a execution persistida
 * terminou em COMPLETED. O retorno do modelo/worker nunca pode, sozinho,
 * transformar uma execution FAILED em runtime_jobs.SUCCEEDED.
 */
export function resolveRuntimeJobOutcome(
  result: { ok?: boolean; error?: string; message?: string } | null,
  executionStatus: string | null | undefined
): RuntimeJobOutcome {
  const status = String(executionStatus ?? "").toUpperCase();
  if (status === "COMPLETED") {
    return { action: "succeed", status: "SUCCEEDED", reason: result?.error ?? "EXECUTION_COMPLETED" };
  }
  if (status === "CANCELLED") {
    return { action: "cancel", status: "CANCELLED", reason: result?.error ?? "EXECUTION_CANCELLED" };
  }
  if (status === "FAILED") {
    return { action: "retry", status: "FAILED", reason: result?.error ?? "EXECUTION_FAILED" };
  }
  if (["PENDING", "RUNNING", "PAUSED", "INTERRUPTED"].includes(status)) {
    return { action: "retry", status: "PENDING", reason: "EXECUTION_NOT_TERMINAL" };
  }
  return { action: "retry", status: "PENDING", reason: result?.error ?? "EXECUTION_STATE_UNKNOWN" };
}

export async function enqueueMissionExecutionJob(opts: {
  missionId: string;
  userId: string;
  currentTaskId?: string | null;
  conversationId?: string | null;
  maxIterations?: number;
  requestId?: string | null;
}) {
  const started = await queueExecution({
    missionId: opts.missionId,
    userId: opts.userId,
    currentTaskId: opts.currentTaskId ?? null,
  });
  const execution = started.execution;
  if (!execution?.id) throw new Error("EXECUTION_NOT_CREATED");

  const db = getDb();
  const existing = await db
    .select()
    .from(runtimeJobs)
    .where(eq(runtimeJobs.executionId, execution.id))
    .limit(1);
  const payload: RuntimeJobPayload = {
    currentTaskId: opts.currentTaskId ?? null,
    conversationId: opts.conversationId ?? null,
    maxIterations: opts.maxIterations,
    requestId: opts.requestId ?? null,
  };
  const row = existing[0];
  if (row) {
    if (row.status === "SUCCEEDED" || row.status === "RUNNING") {
      return { job: row, execution, created: false as const };
    }
    const [requeued] = await db
      .update(runtimeJobs)
      .set({
        status: "PENDING",
        payload,
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockToken: null,
        lastError: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(runtimeJobs.id, row.id))
      .returning();
    return { job: requeued ?? row, execution, created: false as const };
  }

  const [job] = await db
    .insert(runtimeJobs)
    .values({
      userId: opts.userId,
      missionId: opts.missionId,
      executionId: execution.id,
      kind: "mission_execution",
      status: "PENDING",
      payload,
      maxAttempts: RUNTIME_JOB_MAX_ATTEMPTS,
      availableAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  if (!job) throw new Error("JOB_NOT_CREATED");
  return { job, execution, created: true as const };
}

/** Claim atômico: duas instâncias não conseguem obter o mesmo job. */
export async function claimNextRuntimeJob() {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - RUNTIME_JOB_LEASE_MS);
  const lockToken = randomUUID();
  const [job] = await db
    .update(runtimeJobs)
    .set({
      status: "RUNNING",
      lockedAt: now,
      lockToken,
      attempts: sql`${runtimeJobs.attempts} + 1`,
      updatedAt: now,
    })
    .where(sql`${runtimeJobs.id} = (
      SELECT id
      FROM runtime_jobs
      WHERE attempts < max_attempts
        AND (
          (status = 'PENDING' AND available_at <= ${now})
          OR (status = 'RUNNING' AND locked_at < ${staleBefore})
        )
      ORDER BY available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )`)
    .returning();
  return job ?? null;
}

/** Compatibilidade para callers antigos: só faz lease de um job PENDING específico. */
export async function leaseRuntimeJob(jobId: string) {
  const db = getDb();
  const now = new Date();
  const lockToken = randomUUID();
  const [job] = await db
    .update(runtimeJobs)
    .set({ status: "RUNNING", lockedAt: now, lockToken, updatedAt: now })
    .where(and(eq(runtimeJobs.id, jobId), eq(runtimeJobs.status, "PENDING")))
    .returning();
  return job ?? null;
}

export async function completeRuntimeJob(
  jobId: string,
  lockToken: string,
  status: RuntimeJobTerminalStatus,
  error?: string
) {
  const db = getDb();
  const [job] = await db
    .update(runtimeJobs)
    .set({
      status,
      lastError: status === "SUCCEEDED" ? null : sanitizeError(error, `JOB_${status}`),
      lockedAt: null,
      lockToken: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(runtimeJobs.id, jobId), eq(runtimeJobs.lockToken, lockToken), eq(runtimeJobs.status, "RUNNING"))
    )
    .returning();
  return job ?? null;
}

export async function retryRuntimeJob(jobId: string, lockToken: string, error: string) {
  const db = getDb();
  const now = new Date();
  const safeError = sanitizeError(error, "JOB_FAILED");
  const [job] = await db
    .update(runtimeJobs)
    .set({
      status: sql`CASE WHEN ${runtimeJobs.attempts} >= ${runtimeJobs.maxAttempts} THEN 'FAILED' ELSE 'PENDING' END`,
      availableAt: new Date(now.getTime() + RUNTIME_JOB_RETRY_DELAY_MS),
      lastError: safeError,
      lockedAt: null,
      lockToken: null,
      updatedAt: now,
      completedAt: sql`CASE WHEN ${runtimeJobs.attempts} >= ${runtimeJobs.maxAttempts} THEN ${now} ELSE NULL END`,
    })
    .where(
      and(eq(runtimeJobs.id, jobId), eq(runtimeJobs.lockToken, lockToken), eq(runtimeJobs.status, "RUNNING"))
    )
    .returning();
  return job ?? null;
}

/** Cancela um job ligado à execution quando o usuário interrompe a missão. */
export async function cancelRuntimeJobForExecution(executionId: string, userId: string, reason = "CANCELLED_BY_USER") {
  const db = getDb();
  const now = new Date();
  const [job] = await db
    .update(runtimeJobs)
    .set({
      status: "CANCELLED",
      lastError: sanitizeError(reason, "CANCELLED_BY_USER"),
      lockedAt: null,
      lockToken: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(runtimeJobs.executionId, executionId),
        eq(runtimeJobs.userId, userId),
        inArray(runtimeJobs.status, ["PENDING", "RUNNING"])
      )
    )
    .returning();
  return job ?? null;
}

/**
 * Corrige divergências terminais criadas por versões anteriores do worker.
 * Jobs ligados a executions não terminais voltam para PENDING; executions
 * FAILED/CANCELLED nunca deixam o job aparecer como SUCCEEDED.
 */
export async function reconcileRuntimeJobStates(limit = 100) {
  const db = getDb();
  const rows = await db
    .select({
      jobId: runtimeJobs.id,
      jobStatus: runtimeJobs.status,
      executionId: runtimeJobs.executionId,
      executionStatus: executions.status,
    })
    .from(runtimeJobs)
    .innerJoin(executions, eq(runtimeJobs.executionId, executions.id))
    .where(
      or(
        and(eq(runtimeJobs.status, "SUCCEEDED"), sql`${executions.status} <> 'COMPLETED'`),
        and(eq(runtimeJobs.status, "FAILED"), eq(executions.status, "COMPLETED")),
        and(eq(runtimeJobs.status, "CANCELLED"), eq(executions.status, "COMPLETED"))
      )
    )
    .orderBy(desc(runtimeJobs.updatedAt))
    .limit(limit);

  const repaired: Array<{ jobId: string; executionId: string; from: string; to: RuntimeJobStatus }> = [];
  for (const row of rows) {
    const executionStatus = String(row.executionStatus).toUpperCase();
    const next: RuntimeJobStatus =
      executionStatus === "COMPLETED"
        ? "SUCCEEDED"
        : executionStatus === "CANCELLED"
          ? "CANCELLED"
          : executionStatus === "FAILED"
            ? "FAILED"
            : "PENDING";
    const updated = await db
      .update(runtimeJobs)
      .set({
        status: next,
        lastError: next === "SUCCEEDED" ? null : `STATE_RECONCILED_FROM_${row.jobStatus}`,
        availableAt: next === "PENDING" ? new Date() : undefined,
        lockedAt: null,
        lockToken: null,
        completedAt: next === "PENDING" ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(runtimeJobs.id, row.jobId), eq(runtimeJobs.status, row.jobStatus)))
      .returning({ id: runtimeJobs.id });
    if (updated[0]) {
      repaired.push({
        jobId: row.jobId,
        executionId: row.executionId,
        from: String(row.jobStatus),
        to: next,
      });
    }
  }
  return repaired;
}

export function parseRuntimeJobPayload(raw: unknown): RuntimeJobPayload {
  return asPayload(raw);
}
