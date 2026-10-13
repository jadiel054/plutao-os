import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getUserRuntimeJobHealth } from "@/lib/runtime/runtimeJobHealth";
import { processUserRuntimeJobs } from "@/lib/runtime/processUserJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow multi-job drain within Vercel Pro limits. */
export const maxDuration = 300;

/** GET /api/runtime/queue — contagens da fila do usuário autenticado. */
export async function GET() {
  try {
    const user = await requireUser();
    const queue = await getUserRuntimeJobHealth(user.id);
    return NextResponse.json({
      ok: true,
      scope: "user",
      userId: user.id,
      queue,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[GET /api/runtime/queue]", e);
    return NextResponse.json({ ok: false, error: "QUEUE_UNAVAILABLE" }, { status: 503 });
  }
}

/**
 * POST /api/runtime/queue — processa até N jobs PENDING do próprio usuário.
 * Body opcional: { maxJobs?: number } (1–5, default 3).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const raw = typeof body.maxJobs === "number" ? body.maxJobs : 3;
    const maxJobs = Math.max(1, Math.min(5, Math.floor(raw)));

    const result = await processUserRuntimeJobs(user.id, maxJobs);
    const queue = await getUserRuntimeJobHealth(user.id);

    return NextResponse.json({
      ok: true,
      scope: "user",
      processed: result.processed,
      releasedApprovals: result.releasedApprovals,
      queue,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[POST /api/runtime/queue]", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "PROCESS_FAILED",
      },
      { status: 500 }
    );
  }
}
