import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { executions, missions, runtimeJobs, writeGates } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence } from "@/lib/missions/ownership";
import { authorized } from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ jobId: string }> };

export type AegisJobStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed";

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const serviceUserId = process.env.PLUTAO_SERVICE_USER_ID;
    if (!serviceUserId) {
      return NextResponse.json(
        { success: false, error: "PLUTAO_SERVICE_USER_ID not configured" },
        { status: 500 }
      );
    }

    const { jobId } = await ctx.params;
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId is required" }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select({
        job: runtimeJobs,
        execution: executions,
        mission: missions,
      })
      .from(runtimeJobs)
      .innerJoin(executions, eq(runtimeJobs.executionId, executions.id))
      .innerJoin(missions, eq(runtimeJobs.missionId, missions.id))
      .where(and(eq(runtimeJobs.id, jobId), eq(runtimeJobs.userId, serviceUserId)))
      .limit(1);

    const record = rows[0];
    if (!record) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const { job, execution, mission } = record;

    // Check for pending write gates associated with this execution or mission
    const gates = await db
      .select()
      .from(writeGates)
      .where(
        and(
          eq(writeGates.userId, serviceUserId),
          eq(writeGates.executionId, execution.id)
        )
      )
      .limit(50);

    const hasPendingGates = gates.some((g) => g.status === "pending");

    // Resolve unified status
    let status: AegisJobStatus = "queued";
    const jobStatus = String(job.status || "").toUpperCase();
    const executionStatus = String(execution.status || "").toUpperCase();
    const missionStatus = String(mission.status || "").toUpperCase();

    if (hasPendingGates || jobStatus === "WAITING_APPROVAL") {
      status = "awaiting_approval";
    } else if (jobStatus === "SUCCEEDED" || executionStatus === "COMPLETED" || missionStatus === "COMPLETED") {
      status = "completed";
    } else if (
      jobStatus === "FAILED" ||
      jobStatus === "CANCELLED" ||
      executionStatus === "FAILED" ||
      executionStatus === "CANCELLED" ||
      missionStatus === "FAILED" ||
      missionStatus === "CANCELLED"
    ) {
      status = "failed";
    } else if (jobStatus === "RUNNING" || executionStatus === "RUNNING") {
      status = "running";
    } else {
      status = "queued";
    }

    const evidence = parseEvidence(mission.evidence);

    // Extract output details
    const checkpoint =
      execution.checkpoint && typeof execution.checkpoint === "object"
        ? (execution.checkpoint as Record<string, unknown>)
        : {};

    const lastEvidence = evidence[evidence.length - 1];
    const output =
      typeof checkpoint.output === "string"
        ? checkpoint.output
        : lastEvidence?.content || mission.context || "";

    const error = job.lastError || execution.error || null;

    return NextResponse.json({
      success: true,
      job_id: job.id,
      mission_id: mission.id,
      status,
      output,
      evidence,
      error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[api/agent/execute/[jobId]]", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
