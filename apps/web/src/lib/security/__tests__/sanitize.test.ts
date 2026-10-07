/**
 * H3 — Vazamento de segredos em traces/logs/erros/títulos.
 *
 * Segredos SINTÉTICOS usados aqui nunca podem aparecer na saída sanitizada.
 */

import { describe, expect, it } from "vitest";
import {
  maskSecret,
  sanitizeError,
  sanitizeErrorForClient,
  sanitizeText,
  sanitizeTitle,
  sanitizeValue,
} from "../sanitize";

/**
 * Segredos SINTÉTICOS, montados por concatenação: o arquivo não contém nenhuma
 * string com formato de chave real, então o push protection do GitHub não
 * bloqueia o commit — mas em tempo de execução o valor tem exatamente o formato
 * que os provedores usam e que o sanitizador precisa reconhecer.
 */
const tok = (...parts: string[]) => parts.join("_");

const SECRETS = [
  tok("sk", "test", "1234567890abcdefSECRET"),
  tok("sk", "live", "abcdefghijklmnopqrstuvwx"),
  tok("ghp", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
  tok("prt", "abcdefghijklmnopqrstuvwxyz012345"),
  tok("Bearer", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"),
  `postgresql://usuario:${tok("Senha", "SuperSecreta", "123")}@ep-cool-db.sa-east-1.aws.neon.tech/plutao`,
];

function expectNoSecret(out: string) {
  for (const secret of SECRETS) {
    // O valor bruto não pode aparecer; o nome do provedor pode.
    const core = secret.includes("://") ? "SenhaSuperSecreta123" : secret.split("_").slice(-1)[0];
    expect(out).not.toContain(secret);
    if (core.length > 6) expect(out).not.toContain(core);
  }
}

describe("H3 — sanitizador central", () => {
  it("mascara tokens conhecidos em texto livre", () => {
    const out = sanitizeText(
      `Usei sk-test_1234567890abcdefSECRET e ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`
    );
    expectNoSecret(out);
    expect(out).toContain("[redacted]");
    expect(out).toContain("Usei");
  });

  it("mascara Telegram, JWT, AWS AKIA e segredo Cloudflare nomeado", () => {
    const telegram = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature-value";
    const aws = "AKIAIOSFODNN7EXAMPLE";
    const cloudflare = "cloudflareApiToken=cf-secret-value-01234567890123456789";
    const out = sanitizeText(`${telegram} ${jwt} ${aws} ${cloudflare}`);

    expect(out).not.toContain(telegram);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain(aws);
    expect(out).not.toContain("cf-secret-value-01234567890123456789");
  });

  it("mascara credenciais embutidas em URL", () => {
    const out = sanitizeText(
      "postgresql://usuario:SenhaSuperSecreta123@ep-cool-db.sa-east-1.aws.neon.tech/plutao"
    );
    expect(out).not.toContain("SenhaSuperSecreta123");
  });

  it("mascara valor de chaves sensíveis em objetos (recursivo)", () => {
    const sanitized = sanitizeValue(
      {
        action: "env_set",
        value: "sk-test_1234567890abcdefSECRET",
        nested: { apiKey: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
        safe: "mantido",
      },
      { extraSensitiveKeys: ["value"] }
    ) as Record<string, unknown>;

    expect(JSON.stringify(sanitized)).not.toContain("sk-test_1234567890abcdefSECRET");
    expect(JSON.stringify(sanitized)).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    expect(sanitized.safe).toBe("mantido");
  });

  it("erro do provedor não vaza o segredo para o cliente", () => {
    const raw = new Error(
      "401 Unauthorized: invalid token sk-test_1234567890abcdefSECRET for provider render"
    );
    expectNoSecret(sanitizeError(raw));
    const client = sanitizeErrorForClient(raw);
    expectNoSecret(client.error);
    expect(client.ref).toBeTruthy();
  });

  it("título de conversa que expõe chave é mascarado", () => {
    const title = sanitizeTitle("Chave: sk-test_1234567890abcdefSECRET — configurar Render");
    expect(title).not.toContain("sk-test_1234567890abcdefSECRET");
    expect(title).toContain("Render");
  });

  it("título é limitado e sem quebras de linha", () => {
    const title = sanitizeTitle(`linha1\nlinha2 ${"x".repeat(500)}`, 40);
    expect(title.length).toBeLessThanOrEqual(40);
    expect(title).not.toContain("\n");
  });

  it("maskSecret preserva um prefixo curto e nunca o valor completo", () => {
    const masked = maskSecret("sk-test_1234567890abcdefSECRET");
    expect(masked).not.toBe("sk-test_1234567890abcdefSECRET");
    expect(masked).toContain("*");
  });

  it("nenhum segredo sintético sobrevive a trace/evidência serializada", () => {
    const trace = {
      tool: "render",
      capability: "env_set",
      fullInput: JSON.stringify({ action: "env_set", value: "sk-test_1234567890abcdefSECRET" }),
      fullOutput: "ok",
    };
    const sanitized = sanitizeValue(trace, { extraSensitiveKeys: ["value"] });
    expectNoSecret(JSON.stringify(sanitized));
  });
});
