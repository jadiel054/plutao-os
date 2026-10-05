import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { totpSecrets } from "@plutao/db";
import { getDb } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/connectors/crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const TWO_FACTOR_CHALLENGE_COOKIE = "plutao_2fa_challenge";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function isTwoFactorEnabled(userId: string) {
  const row = (await getDb().select({ enabled: totpSecrets.enabled }).from(totpSecrets).where(eq(totpSecrets.userId, userId)).limit(1))[0];
  return row?.enabled === true;
}

export function createTotpSecret() { return generateSecret({ length: 20 }); }
export function makeOtpUri(email: string, secret: string) {
  return generateURI({ issuer: "Plutão OS", label: email, secret, algorithm: "sha1", digits: 6, period: 30 });
}
export async function makeOtpQrDataUri(email: string, secret: string) {
  return QRCode.toDataURL(makeOtpUri(email, secret), { errorCorrectionLevel: "M", margin: 1, width: 240 });
}
export function isValidTotp(secret: string, token: string) { return /^\d{6}$/.test(token) && verifySync({ secret, token }).valid === true; }
export function newBackupCode() { return `${randomBytes(4).toString("hex").slice(0, 4)}-${randomBytes(4).toString("hex").slice(0, 4)}`.toUpperCase(); }
export function normalizeBackupCode(value: unknown) { return typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "") : ""; }
export function hashBackupCode(code: string) { return hashPassword(normalizeBackupCode(code)); }
export function matchesBackupCode(code: string, hash: string) { return verifyPassword(normalizeBackupCode(code), hash); }
export function createTwoFactorChallenge(userId: string) { return encryptToken(JSON.stringify({ userId, expiresAt: Date.now() + CHALLENGE_TTL_MS, nonce: randomBytes(12).toString("hex") })); }
export function readTwoFactorChallenge(value: string) {
  try {
    const payload = JSON.parse(decryptToken(value)) as { userId?: unknown; expiresAt?: unknown };
    if (typeof payload.userId !== "string" || typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return null;
    return { userId: payload.userId };
  } catch { return null; }
}
