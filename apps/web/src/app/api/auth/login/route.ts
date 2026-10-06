import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { totpSecrets, users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { handleGuestMigrationOnAuth } from "@/lib/auth/guest";
import { cookies } from "next/headers";
import { createTwoFactorChallenge, TWO_FACTOR_CHALLENGE_COOKIE } from "@/lib/security/totp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Credenciais obrigatórias" }, { status: 400 });
    }

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
    }

    const twoFactor = (await db
      .select({ enabled: totpSecrets.enabled })
      .from(totpSecrets)
      .where(eq(totpSecrets.userId, user.id))
      .limit(1))[0];
    if (twoFactor?.enabled) {
      const jar = await cookies();
      jar.set(TWO_FACTOR_CHALLENGE_COOKIE, createTwoFactorChallenge(user.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 5 * 60,
      });
      return NextResponse.json({ requiresTwoFactor: true }, { status: 202 });
    }

    await handleGuestMigrationOnAuth(req, user.id);

    const { token, expiresAt } = await createSession({
      userId: user.id,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    await setSessionCookie(token, expiresAt);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "Falha no login" }, { status: 500 });
  }
}
