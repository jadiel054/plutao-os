import { NextRequest, NextResponse } from "next/server";
import { processArtemisTasks } from "@/lib/artemis/poller";
import { sanitizeError } from "@/lib/security/sanitize";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const rawLimit = typeof body.limit === "number" ? body.limit : 3;
    const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 3);
    const result = await processArtemisTasks(limit);
    return NextResponse.json({ ok: true, enabled: true, ...result });
  } catch (error) {
    const safeError = sanitizeError(error, "ARTEMIS_POLLER_UNAVAILABLE");
    console.error("[artemis-poller]", safeError);
    return NextResponse.json({ ok: false, error: safeError }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
