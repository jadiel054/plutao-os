import { NextRequest, NextResponse } from "next/server";
import { reapExpiredWriteGates } from "@/lib/connectors/gates";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const result = await reapExpiredWriteGates();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/cleanup-write-gates] failed", error);
    return NextResponse.json({ error: "REAPER_FAILED" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
