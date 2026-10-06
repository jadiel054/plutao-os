import { describe, expect, it } from "vitest";
import { generateSync, generateSecret } from "otplib";
import { createTotpSecret, hashBackupCode, isValidTotp, matchesBackupCode, makeOtpUri, newBackupCode, normalizeBackupCode } from "@/lib/security/totp";

describe("segurança TOTP", () => {
  it("gera e valida um código compatível com autenticadores", () => {
    const secret = createTotpSecret();
    const token = generateSync({ secret });
    expect(isValidTotp(secret, token)).toBe(true);
    expect(isValidTotp(secret, "000000")).toBe(false);
  });

  it("gera URI otpauth com o emissor do Plutão", () => {
    const uri = makeOtpUri("user@example.com", generateSecret());
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Plut%C3%A3o%20OS");
  });

  it("normaliza e verifica códigos de backup com hash", () => {
    const code = newBackupCode();
    const hash = hashBackupCode(code);
    expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    expect(normalizeBackupCode(` ${code.toLowerCase()} `)).toBe(code.replace("-", ""));
    expect(matchesBackupCode(code, hash)).toBe(true);
    expect(matchesBackupCode("0000-0000", hash)).toBe(false);
  });
});
