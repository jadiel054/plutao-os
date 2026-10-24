import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { cancelWorkflowRun } from "@/lib/artemis/client";
import { appendTerminalEvidence } from "@/lib/artemis/poller";
import { getArtemisTask, toArtemisTaskPublic, transitionArtemisTask } from "@/lib/artemis/service";
import { sanitizeError, sanitizeText } from "@/lib/security/sanitize";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const task = await getArtemisTask(id, user.id);
  if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (task.status === "cancelled") return NextResponse.json({ ok: true, alreadyCancelled: true, task: toArtemisTaskPublic(task) });
  if (["done", "failed", "timeout"].includes(task.status)) {
    return NextResponse.json({ error: "TASK_ALREADY_TERMINAL", task: toArtemisTaskPublic(task) }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = sanitizeText(typeof body.reason === "string" ? body.reason : "Cancelada pelo usuário").slice(0, 240);
  if (task.githubRunId) {
    try {
      await cancelWorkflowRun(task.githubRunId);
    } catch (error) {
      console.error("[artemis cancel remote]", sanitizeError(error));
      return NextResponse.json({ error: "GITHUB_RUN_CANCEL_FAILED" }, { status: 502 });
    }
  }

  const cancelled = await transitionArtemisTask(task.id, ["pending", "running"], "cancelled", {
    cancelReason: reason,
    error: reason,
    summary: "Task cancelada pelo usuário.",
    cancelledAt: new Date(),
  });
  if (!cancelled) {
    const current = await getArtemisTask(task.id, user.id);
    if (current?.status === "cancelled") return NextResponse.json({ ok: true, alreadyCancelled: true, task: toArtemisTaskPublic(current) });
    return NextResponse.json({ error: "TASK_STATE_CHANGED" }, { status: 409 });
  }

  await appendTerminalEvidence({
    task: cancelled,
    status: "cancelled",
    content: `ARTEMIS cancelado no device ${cancelled.deviceSerial}. Motivo: ${reason}`,
  });
  return NextResponse.json({ ok: true, alreadyCancelled: false, task: toArtemisTaskPublic(cancelled) });
}
