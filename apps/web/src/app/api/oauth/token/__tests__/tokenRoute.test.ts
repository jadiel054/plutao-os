import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findOAuthClient: vi.fn(),
  findGrantByRefreshToken: vi.fn(),
  issueAccessToken: vi.fn(),
  newRefreshTokenPlain: vi.fn(),
  attachRefreshToken: vi.fn(),
  refreshExpiresAt: vi.fn(),
  refreshTtlSec: vi.fn(),
  touchGrant: vi.fn(),
  timingSafeStringEqual: vi.fn(),
  consumeAuthCodeRow: vi.fn(),
  peekAuthorizationCode: vi.fn(),
  verifyPkceS256: vi.fn(),
}));

vi.mock("@/lib/mcp/grants", () => ({
  findOAuthClient: mocks.findOAuthClient,
  findGrantByRefreshToken: mocks.findGrantByRefreshToken,
  newRefreshTokenPlain: mocks.newRefreshTokenPlain,
  attachRefreshToken: mocks.attachRefreshToken,
  refreshExpiresAt: mocks.refreshExpiresAt,
  refreshTtlSec: mocks.refreshTtlSec,
  touchGrant: mocks.touchGrant,
  consumeAuthCodeRow: mocks.consumeAuthCodeRow,
}));
vi.mock("@/lib/mcp/tokens", () => ({
  issueAccessToken: mocks.issueAccessToken,
  newRefreshTokenPlain: mocks.newRefreshTokenPlain,
  refreshExpiresAt: mocks.refreshExpiresAt,
  refreshTtlSec: mocks.refreshTtlSec,
  timingSafeStringEqual: mocks.timingSafeStringEqual,
  consumeAuthCodeRow: mocks.consumeAuthCodeRow,
  peekAuthorizationCode: mocks.peekAuthorizationCode,
  verifyPkceS256: mocks.verifyPkceS256,
}));

import { POST } from "../route";

function refreshRequest(clientId: string, refreshToken = "refresh-current") {
  return new NextRequest("https://plutao.test/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
  });
}

describe("POST /api/oauth/token client registration checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a grant_type not registered for a known client", async () => {
    mocks.findOAuthClient.mockResolvedValue({ grantTypes: ["authorization_code"], redirectUris: [] });

    const response = await POST(refreshRequest("registered-client"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_grant_type" });
    expect(mocks.findGrantByRefreshToken).not.toHaveBeenCalled();
  });

  it("keeps the legacy refresh-token flow for clients outside the registry", async () => {
    mocks.findOAuthClient.mockResolvedValue(null);
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
    expect(await response.json()).toMatchObject({
      access_token: "access-next",
      refresh_token: "refresh-next",
    });
    expect(mocks.attachRefreshToken).toHaveBeenCalledOnce();
  });
});
