import { NextRequest, NextResponse } from "next/server";
// TEMP - will replace with full file
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ error: "route temporarily under fix" }, { status: 503 });
}
