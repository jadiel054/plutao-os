import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@plutao/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 * Returns process + optional DB connectivity.
 * DB check runs only when DATABASE_URL is set (does not fail the process check).
 */
export async function GET() {
  const body: {
    ok: boolean;
    service: string;
    time: string;
    database?: { ok: boolean; latencyMs?: number; error?: string; skipped?: boolean };
  } = {
    ok: true,
    service: "plutao-web",
    time: new Date().toISOString(),
  };

  if (!process.env.DATABASE_URL) {
    body.database = { ok: false, skipped: true, error: "DATABASE_URL not configured" };
    return NextResponse.json(body, { status: 200 });
  }

  try {
    const result = await checkDatabaseConnection();
    body.database = { ok: true, latencyMs: result.latencyMs };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    body.ok = false;
    body.database = { ok: false, error: message };
    return NextResponse.json(body, { status: 503 });
  }
}
