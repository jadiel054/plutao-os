import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runAutomationExecutor } from "@/lib/runtime/tools/automation";
import { sanitizeError } from "@/lib/security/sanitize";
import { isArtemisTaskStatus, isAutomationExecutor, type ArtemisTaskStatus, type AutomationExecutor } from "@/lib/artemis/types";
import { listArtemisTasks, getArtemisTaskByNonce, toArtemisTaskPublic } from "@/lib/artemis/service";

export const runtime = "nodejs";
type NonArtemisExecutor = Exclude<AutomationExecutor, "artemis">;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const rawExecutor = req.nextUrl.searchParams.get("executor");
  const executor = rawExecutor && isAutomationExecutor(rawExecutor) ? rawExecutor : null;
  const rawStatus = req.nextUrl.searchParams.get("status");
  const status = rawStatus && isArtemisTaskStatus(rawStatus) ? (rawStatus as ArtemisTaskStatus) : null;
  if ((rawExecutor && !executor) || (rawStatus && !status)) return NextResponse.json({ error: "INVALID_FILTER" }, { status: 400 });
  try {
    const tasks = await listArtemisTasks({ userId: user.id, executor, status, limit: Number(req.nextUrl.searchParams.get("limit") || 50) });
    return NextResponse.json({ tasks: tasks.map(toArtemisTaskPublic) });
  } catch (error) {
    console.error("[automation/tasks GET]", sanitizeError(error));
    return NextResponse.json({ error: "AUTOMATION_TASKS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const rawExecutor = typeof body.executor === "string" ? body.executor : "";
    if (!isAutomationExecutor(rawExecutor) || rawExecutor === "artemis") return NextResponse.json({ error: "INVALID_EXECUTOR" }, { status: 400 });
    const executor = rawExecutor as NonArtemisExecutor;
    const result = await runAutomationExecutor(executor, JSON.stringify(body), user.id);
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const task = nonce ? await getArtemisTaskByNonce(nonce, user.id) : null;
    return NextResponse.json({ ok: result.ok, output: result.ok ? result.output : undefined, error: result.ok ? undefined : result.error, task: task ? toArtemisTaskPublic(task) : null }, { status: result.ok ? 202 : 400 });
  } catch (error) {
    console.error("[automation/tasks POST]", sanitizeError(error));
    return NextResponse.json({ error: "AUTOMATION_TASK_CREATE_FAILED" }, { status: 503 });
  }
}
