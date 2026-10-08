import { NextRequest, NextResponse } from "next/server";
import { RUNTIME_JOB_LEASE_MS } from "@/lib/runtime/durableJobs";
import { getRuntimeJobHealth } from "@/lib/runtime/runtimeJobHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

/**
 * GET /api/cron/runtime-worker/health
 *
 * Probe read-only para o cron operacional. Não reivindica nem altera jobs.
 * A resposta contém somente contagens e timestamps agregados da fila.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, service: "plutao-runtime-worker", error: "CRON_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const queue = await getRuntimeJobHealth();
    return NextResponse.json({
      ok: true,
      service: "plutao-runtime-worker",
      time: queue.checkedAt,
      worker: {
        cronConfigured: true,
        leaseMs: RUNTIME_JOB_LEASE_MS,
        maxBatch: 1,
      },
      queue,
    });
  } catch (error) {
    console.error(
      "[runtime-worker/health] queue check failed",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { ok: false, service: "plutao-runtime-worker", error: "DURABLE_QUEUE_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
