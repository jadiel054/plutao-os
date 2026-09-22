import { NextRequest, NextResponse } from "next/server";
import { createGuestSession, GuestRateLimitError } from "@/lib/auth/guest";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || null;

  try {
    const guestSession = await createGuestSession({ ip, userAgent });
    return NextResponse.json({ success: true, guestSession }, { status: 200 });
  } catch (err) {
    if (err instanceof GuestRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error("[POST /api/auth/guest]", err);
    return NextResponse.json({ error: "Erro interno ao criar sessão de convidado." }, { status: 500 });
  }
}
