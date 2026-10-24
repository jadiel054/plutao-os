import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runArtemis } from "@/lib/runtime/tools/artemis";
import { sanitizeError } from "@/lib/security/sanitize";
import { isArtemisTaskStatus, type ArtemisTaskStatus } from "@/lib/artemis/types";
import { getArtemisTaskByNonce, listArtemisTasks, toArtemisTaskPublic } from "@/lib/artemis/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const rawStatus = req.nextUrl.searchParams.get("status");
    const status = rawStatus && isArtemisTaskStatus(rawStatus) ? (rawStatus as ArtemisTaskStatus) : null;
    if (rawStatus && !status) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    const missionId = req.nextUrl.searchParams.get("missionId");
    const rows = await listArtemisTasks({ userId: user.id, status, missionId, limit: Number(req.nextUrl.searchParams.get("limit") || 50) });
    return NextResponse.json({ tasks: rows.map(toArtemisTaskPublic) });
  } catch (error) {
    console.error("[artemis/tasks GET]", sanitizeError(error));
    return NextResponse.json({ error: "ARTEMIS_TASKS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
    if (!nonce) return NextResponse.json({ error: "nonce obrigatório" }, { status: 400 });
    const result = await runArtemis(JSON.stringify(body), user.id);
    if (!result.ok) {
      const status = result.error.includes("DISABLED") ? 503 : result.error.includes("BUSY") ? 409 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    const task = await getArtemisTaskByNonce(nonce, user.id);
    return NextResponse.json(
      { ok: true, gatePending: result.output.includes("GATE_PENDING"), output: result.output, task: task ? toArtemisTaskPublic(task) : null },
      { status: result.output.includes("GATE_PENDING") ? 202 : 202 }
    );
  } catch (error) {
    console.error("[artemis/tasks POST]", sanitizeError(error));
    return NextResponse.json({ error: "ARTEMIS_TASK_CREATE_FAILED" }, { status: 503 });
  }
}
