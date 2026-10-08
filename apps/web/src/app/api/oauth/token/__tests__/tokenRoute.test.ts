import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findGrantByRefreshToken: vi.fn(),
  issueAccessToken: vi.fn(),
  newRefreshTokenPlain: vi.fn(),
  attachRefreshToken: vi.fn(),
  refreshExpiresAt: vi.fn(),
  refreshTtlSec: vi.fn(),
  touchGrant: vi.fn(),
  timingSafeStringEqual: vi.fn(),
  resolveMcpOAuthClient: vi.fn(),
  clientSupportsGrant: vi.fn(),
}));

vi.mock("@/lib/mcp/grants", () => ({
  findGrantByRefreshToken: mocks.findGrantByRefreshToken,
  newRefreshTokenPlain: mocks.newRefreshTokenPlain,
  attachRefreshToken: mocks.attachRefreshToken,
  refreshExpiresAt: mocks.refreshExpiresAt,
  refreshTtlSec: mocks.refreshTtlSec,
  touchGrant: mocks.touchGrant,
}));
vi.mock("@/lib/mcp/tokens", () => ({
  getMcpResourceUrl: () => "https://plutao.test/api/mcp",
  issueAccessToken: mocks.issueAccessToken,
  refreshExpiresAt: mocks.refreshExpiresAt,
  refreshTtlSec: mocks.refreshTtlSec,
  timingSafeStringEqual: mocks.timingSafeStringEqual,
}));
vi.mock("@/lib/mcp/clientMetadata", () => ({
  resolveMcpOAuthClient: mocks.resolveMcpOAuthClient,
  clientSupportsGrant: mocks.clientSupportsGrant,
}));

import { POST } from "../route";

function refreshRequest(clientId: string, refreshToken = "refresh-current", resource = "") {
  return new NextRequest("https://plutao.test/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, ...(resource ? { resource } : {}) }),
  });
}

const legacyClient = {
  clientId: "legacy-client",
  source: "legacy",
  clientName: null,
  redirectUris: [],
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  tokenEndpointAuthMethod: "none",
};

describe("POST /api/oauth/token client policy and resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMcpOAuthClient.mockResolvedValue({ ok: true, client: legacyClient });
    mocks.clientSupportsGrant.mockImplementation((client, grant) => client.grantTypes.includes(grant));
  });

  it("rejects a grant_type not listed in the resolved client metadata", async () => {
    mocks.resolveMcpOAuthClient.mockResolvedValue({
      ok: true,
      client: { ...legacyClient, grantTypes: ["authorization_code"] },
    });

    const response = await POST(refreshRequest("registered-client"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_grant_type" });
    expect(mocks.findGrantByRefreshToken).not.toHaveBeenCalled();
  });

  it("keeps the legacy refresh-token flow for clients outside the registry", async () => {
    mocks.findGrantByRefreshToken.mockResolvedValue({
      id: "grant-1",
      userId: "user-1",
      clientId: "legacy-client",
      scope: "mcp:read",
      redirectUri: "https://legacy.example/callback",
    });
    mocks.timingSafeStringEqual.mockReturnValue(true);
    mocks.issueAccessToken.mockReturnValue({
      accessToken: "access-next",
      tokenType: "Bearer",
      expiresIn: 3600,
      scope: "mcp:read",
    });
    mocks.newRefreshTokenPlain.mockReturnValue("refresh-next");
    mocks.refreshExpiresAt.mockReturnValue(new Date(Date.now() + 60_000));
    mocks.refreshTtlSec.mockReturnValue(86_400);

    const response = await POST(refreshRequest("legacy-client"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ access_token: "access-next", refresh_token: "refresh-next" });
    expect(mocks.attachRefreshToken).toHaveBeenCalledOnce();
  });

  it("rejects a resource indicator for a different MCP server", async () => {
    const response = await POST(refreshRequest("legacy-client", "refresh-current", "https://attacker.example/mcp"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_target" });
    expect(mocks.findGrantByRefreshToken).not.toHaveBeenCalled();
  });
});
