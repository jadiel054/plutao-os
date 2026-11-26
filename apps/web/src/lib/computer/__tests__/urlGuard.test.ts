/**
 * Fase 4 — GUARD DE NAVEGAÇÃO: impede acesso da sessão remota a endereços
 * internos/privados (loopback, rede local, link-local metadata, ranges
 * reservados) e a esquemas perigosos. Vale para agente E humano.
 */
import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, egressDecisionForUrl, isForbiddenNavigateUrl } from "../urlGuard";

function blocked(url: string): boolean {
  return !assertPublicHttpUrl(url).ok;
}

describe("urlGuard — esquemas", () => {
  it("aceita http/https em domínios públicos", () => {
    expect(assertPublicHttpUrl("https://example.com")).toEqual({ ok: true, url: "https://example.com/" });
    expect(assertPublicHttpUrl("http://example.com/p?a=1")).toMatchObject({ ok: true });
    expect(isForbiddenNavigateUrl("https://neon.tech/docs")).toBe(false);
  });

  it("recusa esquemas perigosos e formatos não-http", () => {
    expect(blocked("javascript:alert(1)")).toBe(true);
    expect(blocked("data:text/html;base64,AAAA")).toBe(true);
    expect(blocked("file:///etc/passwd")).toBe(true);
    expect(blocked("vbscript:x")).toBe(true);
    expect(blocked("ftp://example.com")).toBe(true);
    expect(blocked("não é url")).toBe(true);
  });

  it("recusa URL com credencial embutida", () => {
    expect(blocked("https://user:pass@example.com")).toBe(true);
  });
});

describe("urlGuard — endereços internos/privados", () => {
  it("loopback e hosts locais", () => {
    expect(blocked("http://localhost:3000")).toBe(true);
    expect(blocked("http://localhost.evil.com")).toBe(false);
    expect(blocked("http://app.localhost")).toBe(true);
    expect(blocked("http://127.0.0.1/")).toBe(true);
    expect(blocked("http://127.255.0.7/")).toBe(true);
    expect(blocked("http://0.0.0.0/")).toBe(true);
    expect(blocked("http://[::1]/")).toBe(true);
    expect(blocked("http://minipc.local")).toBe(true);
    expect(blocked("http://api.internal")).toBe(true);
    expect(blocked("http://metadata.google.internal")).toBe(true);
  });

  it("redes privadas e link-local (metadata)", () => {
    expect(blocked("http://10.0.0.1")).toBe(true);
    expect(blocked("http://172.16.0.1")).toBe(true);
    expect(blocked("http://172.31.255.255")).toBe(true);
    expect(blocked("http://192.168.1.1")).toBe(true);
    expect(blocked("http://169.254.169.254/latest/meta-data")).toBe(true);
    expect(blocked("http://100.64.0.1")).toBe(true);
    expect(blocked("http://255.255.255.255")).toBe(true);
  });

  it("formas opacas de loopback também são bloqueadas", () => {
    expect(blocked("http://0177.0.0.1")).toBe(true);
    expect(blocked("http://2130706433")).toBe(true);
    expect(blocked("http://[::ffff:127.0.0.1]/")).toBe(true);
    expect(blocked("http://[fe80::1]/")).toBe(true);
    expect(blocked("http://[fd00::1]/")).toBe(true);
  });

  it("endereços públicos legítimos passam", () => {
    expect(blocked("http://172.32.0.1")).toBe(false);
    expect(blocked("http://[2606:4700::1111]/")).toBe(false);
    expect(blocked("http://docs.browserless.io")).toBe(false);
  });
});

describe("Politica de EGRESS (CDP Fetch.requestPaused) — redirecionamentos e requisições secundárias", () => {
  it("target público → continua", () => {
    expect(egressDecisionForUrl("https://example.com/page")).toEqual({ allow: true, errorReason: undefined, reason: null });
  });

  it("redirecionamento para rede privada/loopback/metadata → bloqueado (BlockedByClient)", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:3000/admin",
      "http://192.168.1.1/",
      "http://169.254.169.254",
      "file:///etc/passwd",
      "javascript:fetch('http://169.254.169.254/')",
      "data:text/html,<script>fetch('http://169.254.169.254/')</script>",
    ]) {
      const decision = egressDecisionForUrl(url);
      expect(decision).toMatchObject({ allow: false, errorReason: "BlockedByClient" });
    }
  });

  it("requisição secundária para host privado via hex/opaco → bloqueado", () => {
    expect(egressDecisionForUrl("http://0x7f000001/").allow).toBe(false);
    expect(egressDecisionForUrl("http://2130706433/").allow).toBe(false);
  });
});
