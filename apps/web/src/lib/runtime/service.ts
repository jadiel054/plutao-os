import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { executions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { ensureExecutionsTable } from "./ensure";
import {
  activeIdempotencyKey,
  RECOVERABLE,
  TERMINAL,
  type CheckpointPayload,
  type ExecutionStatus,
} from "./types";

export async function findRecoverableExecution(missionId: string, userId: string) {
  await ensureExecutionsTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(executions)
    .where(
      and(
        eq(executions.missionId, missionId),
        eq(executions.userId, userId),
        inArray(executions.status, ["RUNNING", "PAUSED", "INTERRUPTED"])
      )
    )
    .orderBy(desc(executions.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOwnedExecution(executionId: string, userId: string) {
  await ensureExecutionsTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(executions)
    .where(and(eq(executions.id, executionId), eq(executions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Start or return existing recoverable execution (idempotent).
 * One active run per mission via idempotency_key.
 */
export async function startExecution(opts: {
  missionId: string;
  userId: string;
  currentTaskId?: string | null;
}) {
  await ensureExecutionsTable();
  const existing = await findRecoverableExecution(opts.missionId, opts.userId);
  if (existing) {
    return { execution: existing, created: false as const };
  }

  const now = new Date();
  const key = activeIdempotencyKey(opts.missionId);
  const db = getDb();

  try {
    const inserted = await db
      .insert(executions)
      .values({
        id: randomUUID(),
        missionId: opts.missionId,
        userId: opts.userId,
        currentTaskId: opts.currentTaskId ?? null,
        status: "RUNNING",
        checkpoint: {},
        idempotencyKey: key,
        startedAt: now,
        updatedAt: now,
        createdAt: now,
      })
      .returning();
    return { execution: inserted[0], created: true as const };
  } catch (e: unknown) {
    // unique violation on idempotency_key — concurrent start
    const again = await findRecoverableExecution(opts.missionId, opts.userId);
    if (again) return { execution: again, created: false as const };
    // stale key from terminal run: rotate key by completing path handled elsewhere
    throw e;
  }
}

export async function writeCheckpoint(
  executionId: string,
  userId: string,
  payload: CheckpointPayload
) {
  const row = await getOwnedExecution(executionId, userId);
  if (!row) return { error: "NOT_FOUND" as const };
  if (TERMINAL.has(row.status as ExecutionStatus)) {
    return { error: "TERMINAL" as const };
  }

  const now = new Date();
  const nextCheckpoint = {
    ...(typeof row.checkpoint === "object" && row.checkpoint ? row.checkpoint : {}),
    ...payload,
  };
  const db = getDb();
  const updated = await db
    .update(executions)
    .set({
      checkpoint: nextCheckpoint,
      checkpointAt: now,
      currentTaskId: payload.taskId !== undefined ? payload.taskId : row.currentTaskId,
      status: row.status === "PENDING" ? "RUNNING" : row.status,
      updatedAt: now,
    })
    .where(eq(executions.id, executionId))
    .returning();
  return { execution: updated[0] };
}

export async function pauseExecution(executionId: string, userId: string) {
  const row = await getOwnedExecution(executionId, userId);
  if (!row) return { error: "NOT_FOUND" as const };
  if (!RECOVERABLE.has(row.status as ExecutionStatus) && row.status !== "PENDING") {
    return { error: "NOT_RECOVERABLE" as const };
  }
  const now = new Date();
  const db = getDb();
  const updated = await db
    .update(executions)
    .set({ status: "PAUSED", updatedAt: now })
    .where(eq(executions.id, executionId))
    .returning();
  return { execution: updated[0] };
}

export async function interruptExecution(executionId: string, userId: string) {
  const row = await getOwnedExecution(executionId, userId);
  if (!row) return { error: "NOT_FOUND" as const };
  if (TERMINAL.has(row.status as ExecutionStatus)) {
    return { error: "TERMINAL" as const };
  }
  const now = new Date();
  const db = getDb();
  const updated = await db
    .update(executions)
    .set({ status: "INTERRUPTED", updatedAt: now })
    .where(eq(executions.id, executionId))
    .returning();
  return { execution: updated[0] };
}

/** Resume recoverable run → RUNNING. Does not create a new execution. */
export async function resumeExecution(executionId: string, userId: string) {
  const row = await getOwnedExecution(executionId, userId);
  if (!row) return { error: "NOT_FOUND" as const };
  if (!RECOVERABLE.has(row.status as ExecutionStatus)) {
    return { error: "NOT_RECOVERABLE" as const, execution: row };
  }
  const now = new Date();
  const db = getDb();
  const updated = await db
    .update(executions)
    .set({ status: "RUNNING", updatedAt: now })
    .where(eq(executions.id, executionId))
    .returning();
  return { execution: updated[0] };
}

export async function completeExecution(
  executionId: string,
  userId: string,
  status: "COMPLETED" | "FAILED",
  error?: string
) {
  const row = await getOwnedExecution(executionId, userId);
  if (!row) return { error: "NOT_FOUND" as const };
  if (TERMINAL.has(row.status as ExecutionStatus)) {
    return { execution: row, alreadyTerminal: true as const };
  }
  const now = new Date();
  const db = getDb();
  // free idempotency key for a future run on same mission
  const freedKey = `${row.idempotencyKey}:done:${row.id}`;
  const updated = await db
    .update(executions)
    .set({
      status,
      error: error ?? null,
      completedAt: now,
      updatedAt: now,
      idempotencyKey: freedKey,
    })
    .where(eq(executions.id, executionId))
    .returning();
  return { execution: updated[0], alreadyTerminal: false as const };
}
