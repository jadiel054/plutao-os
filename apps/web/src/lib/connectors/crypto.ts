import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret =
    process.env.CONNECTOR_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    "";
  if (!secret || secret.length < 16) {
    throw new Error(
      "CONNECTOR_TOKEN_SECRET (ou SESSION_SECRET) com pelo menos 16 caracteres é obrigatório para cifrar tokens de conectores"
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Formato: iv_b64:tag_b64:ciphertext_b64 */
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptToken(blob: string): string {
  const key = getKey();
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("Token cifrado inválido");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function canEncryptTokens(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
