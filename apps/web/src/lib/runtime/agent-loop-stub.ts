/**
 * Agent Loop stub — deterministic, no LLM/tools.
 *
 * Contract:
 *   load execution+task → apply step → evidence → checkpoint → next state
 *
 * Idempotency: completedTaskIds in checkpoint; repeating step on same task is no-op.
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq, notInArray } from "drizzle-orm";
import { missions, tasks } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { completeExecution, getOwnedExecution } from "./service";
import { RECOVERABLE, type ExecutionStatus } from "./types";

const STEP_NAME = "stub:complete_task";
const SOURCE = "agent_loop_stub";

type CheckpointShape = {
  step?: string;
  stepIndex?: number;
  taskId?: string | null;
  note?: string;
  evidenceId?: string;
  completedTaskIds?: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function asCheckpoint(raw: unknown): CheckpointShape {
  if (raw && typeof raw === "object") return raw as CheckpointShape;
  return {};
}

/**
 * One deterministic step on a RUNNING execution.
 * Completes the next open task on the mission, appends evidence, checkpoints.
 */
export async function runStubStep(executionId: string, userId: string) {
  const execution = await getOwnedExecution(executionId, userId);
  if (!execution) return { error: "NOT_FOUND" as const };

  const status = execution.status as ExecutionStatus;
  if (status === "PAUSED" || status === "INTERRUPTED") {
    return { error: "NOT_RUNNING" as const, hint: "resume before step" };
  }
  if (!RECOVERABLE.has(status) && status !== "PENDING") {
    return { error: "TERMINAL" as const };
  }
  if (status === "PENDING") {
    return { error: "NOT_RUNNING" as const, hint: "execution not started" };
  }

  const cp = asCheckpoint(execution.checkpoint);
  const done = new Set(cp.completedTaskIds ?? []);

  const db = getDb();

  // Prefer currentTaskId if still open; else first non-terminal task not yet stub-completed
  const missionTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.missionId, execution.missionId))
    .orderBy(asc(tasks.createdAt))
    .limit(50);

  const open = missionTasks.filter(
    (t) =>
      !done.has(t.id) &&
      t.status !== "COMPLETED" &&
      t.status !== "CANCELLED" &&
      t.status !== "FAILED"
  );

  if (open.length === 0) {
    // All tasks done by stub → complete execution (idempotent if already terminal handled above)
    const finished = await completeExecution(executionId, userId, "COMPLETED");
    if ("error" in finished) return { error: finished.error };
    return {
      done: true as const,
      applied: false as const,
      execution: finished.execution,
      message: "no open tasks; execution completed",
    };
  }

  let target =
    execution.currentTaskId && open.find((t) => t.id === execution.currentTaskId)
      ? open.find((t) => t.id === execution.currentTaskId)!
      : open[0];

  // Idempotent: if this task id already in completedTaskIds (race), skip
  if (done.has(target.id)) {
    return {
      done: false as const,
      applied: false as const,
      execution,
      message: "step already applied for this task",
    };
  }

  const beforeStatus = target.status;
  const now = new Date();
  const evidenceId = randomUUID();
  const stepIndex = (cp.stepIndex ?? 0) + 1;

  const evidenceItem: EvidenceItem = {
    id: evidenceId,
    type: "agent_step",
    content: `stub: completed step ${stepIndex} on task "${target.title}"`,
    source: SOURCE,
    taskId: target.id,
    missionId: execution.missionId,
    createdAt: now.toISOString(),
  };

  // Load mission evidence and append
  const missionRows = await db
    .select({ evidence: missions.evidence })
    .from(missions)
    .where(and(eq(missions.id, execution.missionId), eq(missions.userId, userId)))
    .limit(1);
  if (!missionRows[0]) return { error: "NOT_FOUND" as const };

  const prevEv = parseEvidence(missionRows[0].evidence);
  // Idempotency on evidence: same taskId + source agent_loop_stub already present
  const alreadyEv = prevEv.some(
    (e) => e.taskId === target.id && e.source === SOURCE && e.type === "agent_step"
  );
  if (alreadyEv) {
    done.add(target.id);
    const nextCp: CheckpointShape = {
      ...cp,
      step: STEP_NAME,
      stepIndex: cp.stepIndex ?? stepIndex,
      taskId: target.id,
      evidenceId: prevEv.find((e) => e.taskId === target.id && e.source === SOURCE)?.id,
      completedTaskIds: [...done],
      note: "idempotent: evidence already present",
    };
    const { executions } = await import("@plutao/db");
    const updated = await db
      .update(executions)
      .set({ checkpoint: nextCp, checkpointAt: now, updatedAt: now, currentTaskId: target.id })
      .where(eq(executions.id, executionId))
      .returning();
    return {
      done: false as const,
      applied: false as const,
      execution: updated[0],
      message: "idempotent: evidence already recorded",
    };
  }

  // Apply: complete task + evidence + checkpoint
  await db
    .update(tasks)
    .set({
      status: "COMPLETED",
      updatedAt: now,
      completedAt: now,
      startedAt: target.startedAt ?? now,
    })
    .where(eq(tasks.id, target.id));

  await db
    .update(missions)
    .set({ evidence: [...prevEv, evidenceItem], updatedAt: now })
    .where(eq(missions.id, execution.missionId));

  done.add(target.id);
  const nextOpen = open.filter((t) => t.id !== target.id);
  const nextTaskId = nextOpen[0]?.id ?? target.id;

  const nextCp: CheckpointShape = {
    step: STEP_NAME,
    stepIndex,
    taskId: target.id,
    note: `task completed by ${SOURCE}`,
    evidenceId,
    completedTaskIds: [...done],
    before: { taskStatus: beforeStatus },
    after: { taskStatus: "COMPLETED" },
  };

  const { executions } = await import("@plutao/db");
  const updated = await db
    .update(executions)
    .set({
      checkpoint: nextCp,
      checkpointAt: now,
      currentTaskId: nextTaskId,
      status: "RUNNING",
      updatedAt: now,
    })
    .where(eq(executions.id, executionId))
    .returning();

  // If no more open tasks, complete execution
  if (nextOpen.length === 0) {
    const finished = await completeExecution(executionId, userId, "COMPLETED");
    if ("error" in finished) {
      return {
        done: true as const,
        applied: true as const,
        execution: updated[0],
        evidence: evidenceItem,
        taskId: target.id,
        message: "step applied; complete failed",
      };
    }
    return {
      done: true as const,
      applied: true as const,
      execution: finished.execution,
      evidence: evidenceItem,
      taskId: target.id,
      message: "step applied; all tasks complete",
    };
  }

  return {
    done: false as const,
    applied: true as const,
    execution: updated[0],
    evidence: evidenceItem,
    taskId: target.id,
    message: "step applied",
  };
}
