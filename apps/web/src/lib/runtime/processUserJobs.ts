/**
 * Process durable runtime jobs owned by a single user (Cockpit "Processar fila agora").
 * Reuses the same mission execution path as the cron worker, scoped by userId.
 */

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { runtimeJobs } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getOwnedConversation, getOwnedMission, getOwnedTaskInMission } from "@/lib/missions/ownership";
import { isMissionStatus, TERMINAL_STATUSES } from "@/lib/missions/lifecycle";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import {
  completeRuntimeJob,
  continueRuntimeJob,
  parseRuntimeJobPayload,
  releaseResolvedApprovalJobs,
  resolveRuntimeJobOutcome,
  retryRuntimeJob,
  waitRuntimeJobForApproval,
  RUNTIME_JOB_LEASE_MS,
} from "@/lib/runtime/durableJobs";
import {
  completeExecution,
  getOwnedExecution,
  resumeExecution,
} from "@/lib/runtime/service";
import { ensurePersistedMissionGraph } from "@/lib/missions/graphPersistence";
import { getMissionGraphSerialOrder } from "@plutao/domain";
import { sanitizeError } from "@/lib/security/sanitize";

async function claimNextJobForUser(userId: string) {
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
      WHERE user_id = ${userId}
        AND attempts < max_attempts
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

async function releaseUserApprovalJobs(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: runtimeJobs.id })
    .from(runtimeJobs)
    .where(
      and(
        eq(runtimeJobs.userId, userId),
        eq(runtimeJobs.status, "WAITING_APPROVAL"),
        sql`NOT EXISTS (
          SELECT 1 FROM write_gates
          WHERE write_gates.execution_id = ${runtimeJobs.executionId}
            AND write_gates.user_id = ${runtimeJobs.userId}
            AND write_gates.status IN ('pending', 'approved', 'executing')
        )`
      )
    )
    .limit(20);

  let released = 0;
  for (const row of rows) {
    const [updated] = await db
      .update(runtimeJobs)
      .set({
        status: "PENDING",
        availableAt: new Date(),
        lastError: null,
        lockedAt: null,
        lockToken: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(runtimeJobs.id, row.id), eq(runtimeJobs.status, "WAITING_APPROVAL")))
      .returning({ id: runtimeJobs.id });
    if (updated) released += 1;
  }
  return released;
}

export async function processUserRuntimeJobs(userId: string, maxJobs = 3) {
  const processed: Array<Record<string, unknown>> = [];
  const releasedApprovals = await releaseUserApprovalJobs(userId);
  // Also run global release for gates this user resolved (safe no-op for others)
  await releaseResolvedApprovalJobs(20).catch(() => null);

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimNextJobForUser(userId);
    if (!job) break;

    const payload = parseRuntimeJobPayload(job.payload);

    try {
      let graphContinuation = false;
      let waitingApproval = false;

      if (payload.currentTaskId && !(await getOwnedTaskInMission(payload.currentTaskId, job.missionId, userId))) {
        throw new Error("TASK_NOT_FOUND_IN_MISSION");
      }
      if (payload.conversationId && !(await getOwnedConversation(payload.conversationId, userId))) {
        throw new Error("CONVERSATION_NOT_FOUND");
      }

      let execution = await getOwnedExecution(job.executionId, userId);
      if (!execution) throw new Error("EXECUTION_NOT_FOUND");

      const mission = await getOwnedMission(job.missionId, userId);
      if (!mission) throw new Error("MISSION_NOT_FOUND");

      const missionStatus = String(mission.status).toUpperCase();
      if (isMissionStatus(missionStatus) && TERMINAL_STATUSES.has(missionStatus)) {
        if (!["COMPLETED", "FAILED", "CANCELLED"].includes(String(execution.status))) {
          const cancelled = await completeExecution(
            execution.id,
            userId,
            "CANCELLED",
            "MISSION_ALREADY_TERMINAL"
          );
          execution = cancelled.execution ?? execution;
        }
      } else {
        const missionGraph = await ensurePersistedMissionGraph(job.missionId, userId);
        if (!getMissionGraphSerialOrder(missionGraph)) {
          throw new Error("MISSION_GRAPH_SERIAL_LIMIT");
        }
        if (["PENDING", "PAUSED", "INTERRUPTED"].includes(String(execution.status))) {
          const resumed = await resumeExecution(execution.id, userId);
          if ("error" in resumed || !resumed.execution) {
            throw new Error(resumed.error ?? "EXECUTION_RESUME_FAILED");
          }
          execution = resumed.execution;
        }

        if (["RUNNING"].includes(String(execution.status))) {
          const runResult = await runAutonomousMissionServer({
            missionId: job.missionId,
            userId,
            executionId: job.executionId,
            currentTaskId: payload.currentTaskId ?? null,
            maxIterations: payload.maxIterations,
            missionGraph,
            conversationId: payload.conversationId ?? null,
          });
          graphContinuation = runResult.continuation === true;
          waitingApproval = runResult.waitingApproval === true;
        }
      }

      const finalExecution = await getOwnedExecution(job.executionId, userId);
      const finalMission = await getOwnedMission(job.missionId, userId);

      if (waitingApproval) {
        const waiting = await waitRuntimeJobForApproval(job.id, job.lockToken ?? "");
        if (!waiting) {
          const continued = await continueRuntimeJob(job.id, job.lockToken ?? "");
          processed.push({ id: job.id, status: continued?.status ?? "PENDING", executionStatus: finalExecution?.status });
          continue;
        }
        processed.push({
          id: job.id,
          status: waiting.status,
          executionStatus: finalExecution?.status,
        });
        continue;
      }

      const outcome = resolveRuntimeJobOutcome(null, finalExecution?.status, finalMission?.status);

      if (outcome.action === "succeed") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "SUCCEEDED");
        processed.push({ id: job.id, status: "SUCCEEDED", executionStatus: finalExecution?.status });
      } else if (outcome.action === "cancel") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "CANCELLED", outcome.reason);
        processed.push({ id: job.id, status: "CANCELLED", executionStatus: finalExecution?.status });
      } else if (outcome.action === "fail") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "FAILED", outcome.reason);
        processed.push({ id: job.id, status: "FAILED", executionStatus: finalExecution?.status });
      } else {
        const retry = graphContinuation
          ? await continueRuntimeJob(job.id, job.lockToken ?? "")
          : await retryRuntimeJob(job.id, job.lockToken ?? "", outcome.reason);
        processed.push({
          id: job.id,
          status: graphContinuation ? "CONTINUED" : retry?.status ?? "REQUEUED",
          executionStatus: finalExecution?.status,
          error: outcome.reason,
        });
      }
    } catch (error) {
      const message = sanitizeError(error, "WORKER_EXCEPTION");
      const finalExecution = await getOwnedExecution(job.executionId, userId).catch(() => null);
      const finalMission = await getOwnedMission(job.missionId, userId).catch(() => null);
      const outcome = resolveRuntimeJobOutcome({ error: message }, finalExecution?.status, finalMission?.status);
      if (outcome.action === "cancel") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "CANCELLED", outcome.reason);
      } else if (outcome.action === "fail") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "FAILED", outcome.reason);
      } else if (outcome.action === "succeed") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "SUCCEEDED");
      } else {
        await retryRuntimeJob(job.id, job.lockToken ?? "", message);
      }
      processed.push({ id: job.id, status: "ERROR", error: message });
    }
  }

  return { processed, releasedApprovals };
}
