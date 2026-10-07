import { randomUUID } from "node:crypto";
import { and, eq, lte, lt, or, sql } from "drizzle-orm";
import { runtimeJobs } from "@plutao/db";
import { getDb } from "@/lib/db";
import { startExecution } from "./service";

export const RUNTIME_JOB_LEASE_MS = 8 * 60 * 1000;
export const RUNTIME_JOB_RETRY_DELAY_MS = 30 * 1000;
export const RUNTIME_JOB_MAX_ATTEMPTS = 5;
export type RuntimeJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type RuntimeJobPayload = {
  currentTaskId?: string | null;
  conversationId?: string | null;
  maxIterations?: number;
};

function asPayload(raw: unknown): RuntimeJobPayload {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  return {
    currentTaskId: typeof value.currentTaskId === "string" ? value.currentTaskId : null,
    conversationId: typeof value.conversationId === "string" ? value.conversationId : null,
    maxIterations: typeof value.maxIterations === "number" ? value.maxIterations : undefined,
  };
}

export async function enqueueMissionExecutionJob(opts: {
  missionId: string;
  userId: string;
  currentTaskId?: string | null;
  conversationId?: string | null;
  maxIterations?: number;
}) {
  const started = await startExecution({
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
        availableAt: new Date(),
        lockedAt: null,
        lockToken: null,
        lastError: null,
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
    .where(
      and(
        sql`${runtimeJobs.attempts} < ${runtimeJobs.maxAttempts}`,
        or(
          and(eq(runtimeJobs.status, "PENDING"), lte(runtimeJobs.availableAt, now)),
          and(eq(runtimeJobs.status, "RUNNING"), lt(runtimeJobs.lockedAt, staleBefore))
        )
      )
    )
    .returning();
  return job ?? null;
}

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

export async function completeRuntimeJob(jobId: string, lockToken: string, ok: boolean, error?: string) {
  const db = getDb();
  const [job] = await db
    .update(runtimeJobs)
    .set({
      status: ok ? "SUCCEEDED" : "FAILED",
      lastError: ok ? null : (error ?? "JOB_FAILED").slice(0, 2_000),
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
  const [job] = await db
    .update(runtimeJobs)
    .set({
      status: sql`CASE WHEN ${runtimeJobs.attempts} >= ${runtimeJobs.maxAttempts} THEN 'FAILED' ELSE 'PENDING' END`,
      availableAt: new Date(now.getTime() + RUNTIME_JOB_RETRY_DELAY_MS),
      lastError: error.slice(0, 2_000),
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

export function parseRuntimeJobPayload(raw: unknown): RuntimeJobPayload {
  return asPayload(raw);
}
