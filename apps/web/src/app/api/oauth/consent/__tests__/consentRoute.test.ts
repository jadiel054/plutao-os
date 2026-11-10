import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  createGrant: vi.fn(),
  storeAuthCode: vi.fn(),
  resolveMcpOAuthClient: vi.fn(),
  validateClientRedirectUri: vi.fn(),
  issueAuthorizationCode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/mcp/grants", () => ({
  createGrant: mocks.createGrant,
  storeAuthCode: mocks.storeAuthCode,
}));
vi.mock("@/lib/mcp/clientMetadata", () => ({
  resolveMcpOAuthClient: mocks.resolveMcpOAuthClient,
  validateClientRedirectUri: mocks.validateClientRedirectUri,
}));
vi.mock("@/lib/mcp/tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/tokens")>();
  return {
    ...actual,
    getMcpIssuer: () => "https://plutao.test",
    getMcpResourceUrl: () => "https://plutao.test/api/mcp",
    issueAuthorizationCode: mocks.issueAuthorizationCode,
  };
});

import { POST } from "../route";
import { issueConsentTicket } from "@/lib/mcp/tokens";

const previousSecret = process.env.MCP_TOKEN_SECRET;
const clientId = "test-client";
const redirectUri = "https://client.test/callback";
const resource = "https://plutao.test/api/mcp";

function createTicket(scope: string) {
  return issueConsentTicket({
    sub: "user-1",
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    scope,
    code_challenge: "pkce-challenge",
    state: "state-1",
  });
}

function consentRequest(ticket: string, extra: Record<string, string> = {}) {
  const form = new URLSearchParams({ decision: "approve", consent_ticket: ticket, ...extra });
  return new NextRequest("https://plutao.test/api/oauth/consent", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

describe("POST /api/oauth/consent write scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_TOKEN_SECRET = "temporary-consent-test-secret-long-enough";
    mocks.getSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.resolveMcpOAuthClient.mockResolvedValue({ ok: true, client: { clientName: "Test app" } });
    mocks.validateClientRedirectUri.mockReturnValue({ ok: true });
    mocks.createGrant.mockImplementation(async (input: { scope: string }) => ({ grantId: "grant-1", scope: input.scope }));
    mocks.storeAuthCode.mockResolvedValue(undefined);
    mocks.issueAuthorizationCode.mockReturnValue({ code: "signed-code", jti: "jti-1", expiresAt: new Date(Date.now() + 60_000) });
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.MCP_TOKEN_SECRET;
    else process.env.MCP_TOKEN_SECRET = previousSecret;
  });

  it("does not grant write when the signed request did not ask for it, even if form fields are forged", async () => {
    const ticket = createTicket("mcp:read");
    await POST(consentRequest(ticket, { allow_write: "mcp:write", scope: "mcp:read mcp:write" }));

    expect(mocks.createGrant).toHaveBeenCalledWith(expect.objectContaining({ scope: "mcp:read", writeConsentedAt: null }));
  });

  it("keeps a requested write scope read-only when the checkbox is left unchecked", async () => {
    const ticket = createTicket("mcp:read mcp:write");
    await POST(consentRequest(ticket));

    expect(mocks.createGrant).toHaveBeenCalledWith(expect.objectContaining({ scope: "mcp:read", writeConsentedAt: null }));
  });

  it("stores a consent timestamp only when the user explicitly checks write", async () => {
    const ticket = createTicket("mcp:read mcp:write");
    await POST(consentRequest(ticket, { allow_write: "mcp:write" }));

    expect(mocks.createGrant).toHaveBeenCalledWith(expect.objectContaining({
      scope: "mcp:read mcp:write",
      writeConsentedAt: expect.any(Date),
    }));
    expect(mocks.storeAuthCode).toHaveBeenCalledWith(expect.objectContaining({ scope: "mcp:read mcp:write" }));
  });
});
