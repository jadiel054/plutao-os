import { cookies } from "next/headers";
import { eq, and, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { backupCodes, totpSecrets, users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { decryptToken } from "@/lib/connectors/crypto";
import { isValidTotp, matchesBackupCode, readTwoFactorChallenge, TWO_FACTOR_CHALLENGE_COOKIE } from "@/lib/security/totp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const jar = await cookies();
    const challengeValue = jar.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value;
    const challenge = challengeValue ? readTwoFactorChallenge(challengeValue) : null;
    if (!challenge) return NextResponse.json({ error: "Desafio 2FA expirado. Faça login novamente." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const db = getDb();
    const totp = (await db.select({ secretEnc: totpSecrets.secretEnc, enabled: totpSecrets.enabled }).from(totpSecrets).where(and(eq(totpSecrets.userId, challenge.userId), eq(totpSecrets.enabled, true))).limit(1))[0];
    let valid = Boolean(totp && isValidTotp(decryptToken(totp.secretEnc), token));
    if (!valid && token) {
      const rows = await db.select({ id: backupCodes.id, codeHash: backupCodes.codeHash }).from(backupCodes).where(and(eq(backupCodes.userId, challenge.userId), isNull(backupCodes.usedAt)));
      for (const row of rows) {
        if (matchesBackupCode(token, row.codeHash)) {
          const marked = await db.update(backupCodes).set({ usedAt: new Date() }).where(and(eq(backupCodes.id, row.id), isNull(backupCodes.usedAt))).returning({ id: backupCodes.id });
          valid = marked.length === 1;
          break;
        }
      }
    }
    if (!valid) return NextResponse.json({ error: "Código 2FA inválido" }, { status: 401 });
    const user = (await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, challenge.userId)).limit(1))[0];
    if (!user) return NextResponse.json({ error: "Conta não encontrada" }, { status: 401 });
    const { token: sessionToken, expiresAt } = await createSession({ userId: user.id, userAgent: request.headers.get("user-agent"), ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });
    await setSessionCookie(sessionToken, expiresAt);
    jar.set(TWO_FACTOR_CHALLENGE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("[POST /api/auth/2fa/verify]", error);
    return NextResponse.json({ error: "Falha ao validar o segundo fator" }, { status: 500 });
  }
}
