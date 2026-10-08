import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DYNAMIC_OAUTH_CLIENT_ID_PREFIX,
  isOAuthGrantRegistered,
  isOAuthRedirectRegistered,
  parseOAuthClientRegistration,
} from "@/lib/mcp/clientRegistration";

const ORIGINAL_ALLOWLIST = process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;

afterEach(() => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  else process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = ORIGINAL_ALLOWLIST;
});

describe("parseOAuthClientRegistration", () => {
  beforeEach(() => {
    delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  });

  it("deduplicates identical redirect URIs before validation and stores one exact callback", () => {
    const result = parseOAuthClientRegistration({
      redirect_uris: ["http://127.0.0.1:43127/callback", "http://127.0.0.1:43127/callback"],
      client_name: "plutao-test-client",
    });
    expect(result).toMatchObject({
      ok: true,
      metadata: { redirectUris: ["http://127.0.0.1:43127/callback"], clientName: "plutao-test-client" },
    });
  });

  it.each([
    ["HTTPS fora da allowlist", "https://client.example/callback", "https_uri_not_allowlisted"],
    ["HTTP não loopback", "http://evil.example/callback", "http_non_loopback"],
    ["wildcard", "https://*.example.com/callback", "wildcard_not_allowed"],
    ["fragmento", "https://client.example/callback#fragment", "fragment_not_allowed"],
    ["userinfo", "https://user:pass@client.example/callback", "userinfo_not_allowed"],
    ["esquema não suportado", "ftp://client.example/callback", "unsupported_scheme"],
  ])("rejeita %s com URI exata codificada e razão", (_label, uri, reason) => {
    const result = parseOAuthClientRegistration({ redirect_uris: [uri] });
    expect(result).toMatchObject({ ok: false, error: "invalid_redirect_uri", reason, redirectUri: uri });
    if (!result.ok) expect(result.description).toContain(encodeURIComponent(uri));
  });

  it.each([
    "http://localhost:43127/callback",
    "http://127.0.0.1:50000/oauth/callback",
    "http://[::1]:43127/callback",
  ])("aceita callback loopback RFC 8252 com porta variável: %s", (uri) => {
    expect(parseOAuthClientRegistration({ redirect_uris: [uri] })).toMatchObject({ ok: true });
  });

  it("aceita somente URI HTTPS idêntica à allowlist", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://client.example/callback?tenant=a";
    expect(parseOAuthClientRegistration({ redirect_uris: ["https://client.example/callback?tenant=a"] })).toMatchObject({ ok: true });
    expect(parseOAuthClientRegistration({ redirect_uris: ["https://client.example/callback?tenant=b"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
  });

  it("rejeita clientes confidenciais e tipos não suportados", () => {
    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    })).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback"],
      grant_types: ["client_credentials"],
    })).toMatchObject({ ok: false, error: "invalid_client_metadata" });
  });
});

describe("OAuth client policy", () => {
  const registeredClient = {
    redirectUris: ["https://trusted.example/callback"],
    grantTypes: ["authorization_code"],
  };

  it("compares registered redirects exactly and validates grant types", () => {
    expect(isOAuthRedirectRegistered(registeredClient, "https://attacker.example/callback", "registered-client")).toBe(false);
    expect(isOAuthGrantRegistered(registeredClient, "refresh_token", "registered-client")).toBe(false);
  });

  it("fails closed for missing dynamic clients and preserves legacy opaque client ids", () => {
    expect(isOAuthRedirectRegistered(null, "https://attacker.example/callback", `${DYNAMIC_OAUTH_CLIENT_ID_PREFIX}unknown`)).toBe(false);
    expect(isOAuthGrantRegistered(null, "refresh_token", `${DYNAMIC_OAUTH_CLIENT_ID_PREFIX}unknown`)).toBe(false);
    expect(isOAuthRedirectRegistered(null, "https://legacy.example/callback", "legacy-client")).toBe(true);
  });
});
