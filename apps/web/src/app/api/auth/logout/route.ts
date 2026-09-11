import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/cookies";

export const runtime = "nodejs";

export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) {
      await destroySession(token);
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/logout]", e);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  }
}
