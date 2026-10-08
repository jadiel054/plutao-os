/** Redirect URI policy for MCP OAuth. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRedirectUriAllowed, validateRedirectUri } from "../tokens";

const ORIGINAL = process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;

describe("MCP OAuth redirect URI policy", () => {
  beforeEach(() => {
    delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
    else process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = ORIGINAL;
  });

  it("fails closed for HTTPS when no allowlist or trusted CIMD origin is provided", () => {
    expect(isRedirectUriAllowed("https://client.example/callback")).toBe(false);
  });

  it.each([
    "http://localhost:43127/callback",
    "http://127.0.0.1:8080/oauth/callback",
    "http://[::1]:54321/callback",
  ])("accepts loopback HTTP with a variable port: %s", (uri) => {
    expect(isRedirectUriAllowed(uri)).toBe(true);
  });

  it.each([
    "http://evil.example/callback",
    "http://localhost:43127/callback#fragment",
    "https://*.example.com/callback",
    "https://user:pass@client.example/callback",
    "https://client.example/callback#fragment",
    "ftp://client.example/callback",
    "javascript:alert(1)",
  ])("rejects unsafe callback: %s", (uri) => {
    expect(isRedirectUriAllowed(uri)).toBe(false);
  });

  it("accepts an exact HTTPS entry and rejects lookalike origins or changed paths", () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://app.example/callback";
    expect(isRedirectUriAllowed("https://app.example/callback")).toBe(true);
    expect(isRedirectUriAllowed("https://app.example.evil.io/callback")).toBe(false);
    expect(isRedirectUriAllowed("https://app.example/other")).toBe(false);
  });

  it("permits an exact same-origin HTTPS callback for a CIMD client only", () => {
    expect(validateRedirectUri("https://client.example/oauth/callback", { sameOriginAs: "https://client.example/client.json" }).ok).toBe(true);
    expect(validateRedirectUri("https://other.example/oauth/callback", { sameOriginAs: "https://client.example/client.json" })).toMatchObject({ ok: false, reason: "https_uri_not_allowlisted" });
  });
});
