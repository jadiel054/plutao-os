import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auditEvents, executions, runtimeJobs, tasks } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";
import { verifyDefinitionOfDone } from "@/lib/missions/dod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: missionId } = await ctx.params;
  const mission = await getOwnedMission(missionId, user.id);
  if (!mission) return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });

  try {
    const db = getDb();
    const [taskRows, executionRows, jobRows, telemetryRows] = await Promise.all([
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          parentTaskId: tasks.parentTaskId,
          startedAt: tasks.startedAt,
          completedAt: tasks.completedAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(eq(tasks.missionId, missionId))
        .orderBy(tasks.createdAt),
      db
        .select({
          id: executions.id,
          status: executions.status,
          currentTaskId: executions.currentTaskId,
          checkpoint: executions.checkpoint,
          checkpointAt: executions.checkpointAt,
          error: executions.error,
          startedAt: executions.startedAt,
          updatedAt: executions.updatedAt,
          completedAt: executions.completedAt,
          createdAt: executions.createdAt,
        })
        .from(executions)
        .where(and(eq(executions.missionId, missionId), eq(executions.userId, user.id)))
        .orderBy(desc(executions.createdAt))
        .limit(20),
      db
        .select({
          id: runtimeJobs.id,
          executionId: runtimeJobs.executionId,
          status: runtimeJobs.status,
          attempts: runtimeJobs.attempts,
          maxAttempts: runtimeJobs.maxAttempts,
          availableAt: runtimeJobs.availableAt,
          lockedAt: runtimeJobs.lockedAt,
          lastError: runtimeJobs.lastError,
          updatedAt: runtimeJobs.updatedAt,
          completedAt: runtimeJobs.completedAt,
        })
        .from(runtimeJobs)
        .where(and(eq(runtimeJobs.missionId, missionId), eq(runtimeJobs.userId, user.id)))
        .orderBy(desc(runtimeJobs.updatedAt))
        .limit(10),
      db
        .select({ id: auditEvents.id, type: auditEvents.type, payload: auditEvents.payload, createdAt: auditEvents.createdAt })
        .from(auditEvents)
        .where(and(eq(auditEvents.userId, user.id), eq(auditEvents.type, "runtime.telemetry")))
        .orderBy(desc(auditEvents.createdAt))
        .limit(100),
    ]);

    const telemetry = telemetryRows.filter((row) => {
      const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
      return payload.missionId === missionId;
    });
    const evidence = parseEvidence(mission.evidence);
    const dod = verifyDefinitionOfDone({
      objective: String(mission.objective ?? ""),
      definitionOfDone: mission.definitionOfDone,
      evidence,
    });

    return NextResponse.json({
      mission: {
        id: mission.id,
        objective: mission.objective,
        status: mission.status,
        currentState: mission.currentState,
        definitionOfDone: mission.definitionOfDone,
        plan: mission.plan,
        missionGraph: mission.missionGraph,
        graphVersion: mission.graphVersion,
        completedSteps: mission.completedSteps,
        pendingSteps: mission.pendingSteps,
        createdAt: mission.createdAt,
        updatedAt: mission.updatedAt,
      },
      tasks: taskRows,
      executions: executionRows,
      runtimeJobs: jobRows,
      evidence,
      dod,
      telemetry,
      lastUpdated: mission.updatedAt,
    });
  } catch (error) {
    console.error("[missions/:id/overview GET]", error);
    return NextResponse.json({ error: "Falha ao carregar visão operacional" }, { status: 500 });
  }
}
