import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@plutao/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 * Process + optional DB connectivity.
 * Production responses never include raw database error details.
 */
export async function GET() {
  const isProd = process.env.NODE_ENV === "production";

  const body: {
    ok: boolean;
    service: string;
    time: string;
    database?: {
      ok: boolean;
      latencyMs?: number;
      error?: string;
      skipped?: boolean;
    };
  } = {
    ok: true,
    service: "plutao-web",
    time: new Date().toISOString(),
  };

  if (!process.env.DATABASE_URL) {
    body.database = {
      ok: false,
      skipped: true,
      error: "DATABASE_URL not configured",
    };
    return NextResponse.json(body, { status: 200 });
  }

  try {
    const result = await checkDatabaseConnection();
    body.database = { ok: true, latencyMs: result.latencyMs };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Log full detail server-side only
    console.error("[health] database check failed:", detail);
    body.ok = false;
    body.database = {
      ok: false,
      error: isProd ? "database unavailable" : detail,
    };
    return NextResponse.json(body, { status: 503 });
  }
}
