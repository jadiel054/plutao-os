import { afterEach, describe, expect, it } from "vitest";
import {
  DYNAMIC_OAUTH_CLIENT_ID_PREFIX,
  isOAuthGrantRegistered,
  isOAuthRedirectRegistered,
  parseOAuthClientRegistration,
} from "@/lib/mcp/clientRegistration";

afterEach(() => {
  delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
});

describe("parseOAuthClientRegistration", () => {
  it("uses public-client defaults and returns the requested callback", () => {
    const result = parseOAuthClientRegistration({
      redirect_uris: ["http://127.0.0.1:43127/oauth/callback"],
      client_name: "Manus",
    });

    expect(result).toEqual({
      ok: true,
      metadata: {
        clientName: "Manus",
        redirectUris: ["http://127.0.0.1:43127/oauth/callback"],
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none",
      },
    });
  });

  it("rejects redirects outside the existing allow rules", () => {
    expect(parseOAuthClientRegistration({ redirect_uris: ["http://evil.example/callback"] })).toMatchObject({
      ok: false,
      error: "redirect_uris contains a duplicate or unsupported URI",
    });
    expect(parseOAuthClientRegistration({ redirect_uris: ["https://client.example/callback#fragment"] })).toMatchObject({
      ok: false,
    });
  });

  it("rejects confidential clients and unsupported grant or response types", () => {
    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    })).toMatchObject({ ok: false });

    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback"],
      grant_types: ["client_credentials"],
    })).toMatchObject({ ok: false });

    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback"],
      response_types: ["token"],
    })).toMatchObject({ ok: false });
  });

  it("requires unique redirect URIs and an authorization-code grant", () => {
    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback", "http://localhost:43127/callback"],
    })).toMatchObject({ ok: false });

    expect(parseOAuthClientRegistration({
      redirect_uris: ["http://localhost:43127/callback"],
      grant_types: ["refresh_token"],
    })).toMatchObject({ ok: false });
  });
});

describe("OAuth client policy", () => {
  const registeredClient = {
    redirectUris: ["https://trusted.example/callback"],
    grantTypes: ["authorization_code"],
  };

  it("rejects redirect URIs not registered for the client", () => {
    expect(isOAuthRedirectRegistered(registeredClient, "https://attacker.example/callback", "registered-client")).toBe(false);
  });

  it("rejects grants not registered for the client", () => {
    expect(isOAuthGrantRegistered(registeredClient, "refresh_token", "registered-client")).toBe(false);
  });

  it("preserves the previous behavior for clients absent from the registry", () => {
    expect(isOAuthRedirectRegistered(null, "https://legacy.example/callback", "legacy-client")).toBe(true);
    expect(isOAuthGrantRegistered(null, "refresh_token", "legacy-client")).toBe(true);
  });

  it("fails closed if a dynamically generated client id cannot be found", () => {
    const missingDynamicId = `${DYNAMIC_OAUTH_CLIENT_ID_PREFIX}unknown`;
    expect(isOAuthRedirectRegistered(null, "https://attacker.example/callback", missingDynamicId)).toBe(false);
    expect(isOAuthGrantRegistered(null, "refresh_token", missingDynamicId)).toBe(false);
  });
});
