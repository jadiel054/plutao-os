/**
 * H5(a) — redirect_uri do OAuth MCP.
 *
 * Antes: allowlist vazia devolvia `true` (qualquer https passava) e a comparação
 * era por `startsWith`, então `https://app.exemplo.com.evil.io` era aceito.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRedirectUriAllowed } from "../tokens";

const ORIGINAL = process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;

describe("H5(a) — validação de redirect_uri", () => {
  beforeEach(() => {
    delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
    else process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = ORIGINAL;
  });

  it("allowlist vazia FALHA FECHADO para https", () => {
    expect(isRedirectUriAllowed("https://qualquer-cliente.example.com/callback")).toBe(false);
    expect(isRedirectUriAllowed("https://evil.io/cb")).toBe(false);
  });

  it("allowlist vazia mantém localhost (fluxo de desenvolvimento)", () => {
    expect(isRedirectUriAllowed("http://localhost:3000/callback")).toBe(true);
    expect(isRedirectUriAllowed("http://127.0.0.1:8080/cb")).toBe(true);
  });

  it("origin exato na allowlist é aceito", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://claude.ai/api/mcp/callback";
    expect(isRedirectUriAllowed("https://claude.ai/api/mcp/callback")).toBe(true);
  });

  it("prefixo parecido NÃO é aceito (comparação por origin exato)", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://app.exemplo.com";
    expect(isRedirectUriAllowed("https://app.exemplo.com.evil.io/callback")).toBe(false);
    expect(isRedirectUriAllowed("https://app.exemplo.com.br/callback")).toBe(false);
    // o próprio origin continua válido
    expect(isRedirectUriAllowed("https://app.exemplo.com/callback")).toBe(true);
  });

  it("entrada com caminho exige caminho idêntico", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://cliente.io/oauth/callback";
    expect(isRedirectUriAllowed("https://cliente.io/oauth/callback")).toBe(true);
    expect(isRedirectUriAllowed("https://cliente.io/outro/caminho")).toBe(false);
  });

  it("protocolos e formatos perigosos são recusados", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://cliente.io";
    expect(isRedirectUriAllowed("javascript:alert(1)")).toBe(false);
    expect(isRedirectUriAllowed("data:text/html,<script>1</script>")).toBe(false);
    expect(isRedirectUriAllowed("ftp://cliente.io/cb")).toBe(false);
    expect(isRedirectUriAllowed("https://cliente.io/cb#fragmento")).toBe(false);
    expect(isRedirectUriAllowed("não é url")).toBe(false);
    expect(isRedirectUriAllowed("")).toBe(false);
  });

  it("http não-localhost é sempre recusado", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "http://cliente.io";
    expect(isRedirectUriAllowed("http://cliente.io/cb")).toBe(false);
  });
});
