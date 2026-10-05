import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { backupCodes, totpSecrets, users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth/session";
import { decryptToken, encryptToken } from "@/lib/connectors/crypto";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";
import { createTotpSecret, hashBackupCode, isValidTotp, makeOtpQrDataUri, makeOtpUri, newBackupCode } from "@/lib/security/totp";
import { verifyPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

function unauthorized() { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }

export async function GET() {
  try {
    const user = await requireUser();
    const row = (await getDb().select({ enabled: totpSecrets.enabled }).from(totpSecrets).where(eq(totpSecrets.userId, user.id)).limit(1))[0];
    return NextResponse.json({ enabled: row?.enabled === true, policyVersion: CONSENT_POLICY_VERSION });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    console.error("[GET /api/security/totp]", error);
    return NextResponse.json({ error: "Falha ao ler 2FA" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const db = getDb();
    const existing = (await db.select().from(totpSecrets).where(eq(totpSecrets.userId, user.id)).limit(1))[0];
    const action = body?.action;

    if (action === "setup") {
      if (existing?.enabled) return NextResponse.json({ error: "2FA já está ativo" }, { status: 409 });
      const secret = createTotpSecret();
      const now = new Date();
      if (existing) {
        await db.update(totpSecrets).set({ secretEnc: encryptToken(secret), enabled: false, confirmedAt: null, createdAt: now }).where(eq(totpSecrets.userId, user.id));
      } else {
        await db.insert(totpSecrets).values({ userId: user.id, secretEnc: encryptToken(secret), enabled: false, createdAt: now });
      }
      return NextResponse.json({ secret, otpauthUri: makeOtpUri(user.email, secret), qrDataUri: await makeOtpQrDataUri(user.email, secret) });
    }

    if (action === "enable") {
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!existing || existing.enabled) return NextResponse.json({ error: "Inicie a configuração do 2FA novamente" }, { status: 400 });
      const secret = decryptToken(existing.secretEnc);
      if (!isValidTotp(secret, token)) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
      const plainCodes = Array.from({ length: 10 }, newBackupCode);
      await db.update(totpSecrets).set({ enabled: true, confirmedAt: new Date() }).where(eq(totpSecrets.userId, user.id));
      await db.delete(backupCodes).where(eq(backupCodes.userId, user.id));
      await db.insert(backupCodes).values(plainCodes.map((code) => ({ userId: user.id, codeHash: hashBackupCode(code) })));
      return NextResponse.json({ enabled: true, backupCodes: plainCodes });
    }

    if (action === "disable") {
      const password = typeof body?.password === "string" ? body.password : "";
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      const userRow = (await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1))[0];
      const passwordOk = Boolean(userRow?.passwordHash && password && verifyPassword(password, userRow.passwordHash));
      let codeOk = false;
      if (existing?.enabled && token) codeOk = isValidTotp(decryptToken(existing.secretEnc), token) === true;
      if (!passwordOk && !codeOk) return NextResponse.json({ error: "Informe sua senha ou um código TOTP válido" }, { status: 400 });
      await db.delete(totpSecrets).where(eq(totpSecrets.userId, user.id));
      await db.delete(backupCodes).where(eq(backupCodes.userId, user.id));
      return NextResponse.json({ enabled: false });
    }

    if (action === "use_backup") {
      return NextResponse.json({ error: "Códigos de backup só podem ser usados no login" }, { status: 400 });
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    console.error("[POST /api/security/totp]", error);
    return NextResponse.json({ error: "Falha ao atualizar 2FA" }, { status: 500 });
  }
}
