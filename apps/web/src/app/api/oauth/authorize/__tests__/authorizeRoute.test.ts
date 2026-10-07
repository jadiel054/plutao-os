import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findOAuthClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/mcp/grants", () => ({ findOAuthClient: mocks.findOAuthClient }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));

import { GET } from "../route";

function authorizeRequest(redirectUri: string, clientId = "test-client") {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: "s256-challenge",
    code_challenge_method: "S256",
  });
  return new NextRequest(`https://plutao.test/api/oauth/authorize?${query.toString()}`);
}

describe("GET /api/oauth/authorize client registration checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://legacy.example/callback";
  });

  afterEach(() => {
    delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  });

  it("rejects a redirect_uri not registered for a known client_id", async () => {
    mocks.findOAuthClient.mockResolvedValue({
      redirectUris: ["https://trusted.example/callback"],
      grantTypes: ["authorization_code"],
    });

    const response = await GET(authorizeRequest("https://untrusted.example/callback"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
  });

  it("continues the existing OAuth flow when a legacy client is not in the registry", async () => {
    mocks.findOAuthClient.mockResolvedValue(null);
    mocks.getSessionUser.mockResolvedValue({ id: "user-1" });

    const response = await GET(authorizeRequest("https://legacy.example/callback", "legacy-client-id"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/oauth/consent?");
  });
});
