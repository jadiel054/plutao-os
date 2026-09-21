import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { magicLinkTokens } from "@plutao/db";
import { getOrCreateUserByEmail } from "@/lib/auth/social";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { handleGuestMigrationOnAuth } from "@/lib/auth/guest";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL || req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/login?error=InvalidToken`);
  }

  try {
    const db = getDb();
    const now = new Date();

    const rows = await db
      .select()
      .from(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.token, token),
          isNull(magicLinkTokens.usedAt),
          gt(magicLinkTokens.expiresAt, now)
        )
      )
      .limit(1);

    const tokenRow = rows[0];

    if (!tokenRow) {
      return NextResponse.redirect(`${baseUrl}/login?error=TokenExpiredOrUsed`);
    }

    // Mark token as used
    await db
      .update(magicLinkTokens)
      .set({ usedAt: now })
      .where(eq(magicLinkTokens.id, tokenRow.id));

    // Get or create user by email
    const user = await getOrCreateUserByEmail(tokenRow.email);
    await handleGuestMigrationOnAuth(req, user.id);

    // Create session & cookie
    const { token: sessionToken, expiresAt } = await createSession({
      userId: user.id,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    const res = NextResponse.redirect(`${baseUrl}/cockpit`);
    await setSessionCookie(sessionToken, expiresAt);

    return res;
  } catch (err) {
    console.error("[magic-link/verify] Error:", err);
    return NextResponse.redirect(`${baseUrl}/login?error=MagicLinkVerificationFailed`);
  }
}
