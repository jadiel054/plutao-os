import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sessions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";

export const runtime = "nodejs";

function safeNextPath(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/cockpit";
}

/**
 * Consome o token entregue no deep link plutao:// e troca-o por uma nova sessão
 * HTTP-only dentro do WebView. O token original é apagado antes do redirect,
 * portanto o link só pode ser usado uma vez.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL || req.nextUrl.origin;
  const handoffToken = req.nextUrl.searchParams.get("token");
  if (!handoffToken) {
    return NextResponse.redirect(`${baseUrl}/login?error=MobileOAuthTokenMissing`);
  }

  try {
    const db = getDb();
    const rows = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.token, handoffToken), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const session = rows[0];
    if (!session) {
      return NextResponse.redirect(`${baseUrl}/login?error=MobileOAuthTokenExpired`);
    }

    await db.delete(sessions).where(eq(sessions.token, handoffToken));
    const { token, expiresAt } = await createSession({
      userId: session.userId,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    await setSessionCookie(token, expiresAt);
    return NextResponse.redirect(`${baseUrl}${safeNextPath(req.nextUrl.searchParams.get("next"))}`);
  } catch (err) {
    console.error("[auth/mobile/complete] Unexpected error", err);
    return NextResponse.redirect(`${baseUrl}/login?error=MobileOAuthFailed`);
  }
}
