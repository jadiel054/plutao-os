import { afterEach, describe, expect, it } from "vitest";
import { parseClientMetadataDocument, resolveMcpOAuthClient } from "../clientMetadata";

const originalAllowlist = process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  else process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = originalAllowlist;
});

const clientId = "https://client.example/.well-known/oauth-client.json";

describe("Client ID Metadata Documents", () => {
  it("accepts a public client with an exact same-origin HTTPS callback", () => {
    const result = parseClientMetadataDocument(clientId, {
      client_id: clientId,
      client_name: "Example Agent",
      redirect_uris: ["https://client.example/oauth/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    expect(result).toMatchObject({ ok: true, client: { source: "cimd", clientName: "Example Agent" } });
  });

  it("allows a registered loopback URI for desktop clients", () => {
    const result = parseClientMetadataDocument(clientId, {
      client_id: clientId,
      client_name: "Desktop Agent",
      redirect_uris: ["http://[::1]:43127/callback"],
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("requires exact client_id equality and public-client metadata", () => {
    expect(parseClientMetadataDocument(clientId, {
      client_id: "https://client.example/other.json",
      client_name: "Spoof",
      redirect_uris: ["https://client.example/callback"],
    })).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(parseClientMetadataDocument(clientId, {
      client_id: clientId,
      client_name: "Secret client",
      client_secret: "not-accepted",
      redirect_uris: ["https://client.example/callback"],
    })).toMatchObject({ ok: false, error: "invalid_client_metadata" });
  });

  it("rejects a cross-origin HTTPS callback unless its exact URI is configured", () => {
    const result = parseClientMetadataDocument(clientId, {
      client_id: clientId,
      client_name: "Cross-origin Agent",
      redirect_uris: ["https://callback.example/oauth/callback"],
    });
    expect(result).toMatchObject({ ok: false, error: "invalid_redirect_uri", reason: "https_uri_not_allowlisted" });
  });

  it("rejects wildcard and non-loopback HTTP callbacks", () => {
    expect(parseClientMetadataDocument(clientId, {
      client_id: clientId,
      client_name: "Wildcard Agent",
      redirect_uris: ["https://*.client.example/callback"],
    })).toMatchObject({ ok: false, error: "invalid_redirect_uri", reason: "wildcard_not_allowed" });
    expect(parseClientMetadataDocument(clientId, {
      client_id: clientId,
      client_name: "Insecure Agent",
      redirect_uris: ["http://callback.example/callback"],
    })).toMatchObject({ ok: false, error: "invalid_redirect_uri", reason: "http_non_loopback" });
  });

  it("blocks a CIMD document hosted on a loopback IP before opening a socket", async () => {
    const result = await resolveMcpOAuthClient("https://127.0.0.1/private/client.json");
    expect(result).toMatchObject({ ok: false, error: "invalid_client" });
  });
});
