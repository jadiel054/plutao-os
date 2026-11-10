import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  getActiveGrantScopes: vi.fn(),
  touchGrant: vi.fn(),
}));

vi.mock("@/lib/mcp/grants", () => ({
  getActiveGrantScopes: mocks.getActiveGrantScopes,
  touchGrant: mocks.touchGrant,
}));
vi.mock("@/lib/runtime/tools/sandbox", () => ({ isSandboxUuid: () => true }));
vi.mock("../tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tokens")>();
  return {
    ...actual,
    getMcpIssuer: () => "https://plutao.test",
    getMcpResourceUrl: () => "https://plutao.test/api/mcp",
    verifyAccessToken: () => mocks.claims as never,
  };
});

import { authenticateMcpRequest, mcpUnauthorizedResponse } from "../auth";

const previousApiKey = process.env.PLUTAO_MCP_API_KEY;
const previousUserId = process.env.PLUTAO_MCP_USER_ID;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims = null;
  mocks.getActiveGrantScopes.mockResolvedValue(["mcp:read"]);
  mocks.touchGrant.mockResolvedValue(undefined);
  process.env.PLUTAO_MCP_API_KEY = "test-only-ops-key";
  process.env.PLUTAO_MCP_USER_ID = "00000000-0000-4000-8000-000000000001";
});

afterEach(() => {
  if (previousApiKey === undefined) delete process.env.PLUTAO_MCP_API_KEY;
  else process.env.PLUTAO_MCP_API_KEY = previousApiKey;
  if (previousUserId === undefined) delete process.env.PLUTAO_MCP_USER_ID;
  else process.env.PLUTAO_MCP_USER_ID = previousUserId;
});

describe("MCP bearer auth", () => {
  it("accepts the ops key only in Authorization header and fixes scope to mcp:read", async () => {
    const result = await authenticateMcpRequest(new Request("https://plutao.test/api/mcp", {
      headers: { Authorization: "Bearer test-only-ops-key" },
    }));
    expect(result).toMatchObject({ ok: true, method: "ops_key", scopes: ["mcp:read"] });
  });

  it("does not accept a bearer key in the query string", async () => {
    const result = await authenticateMcpRequest(new Request("https://plutao.test/api/mcp?access_token=test-only-ops-key"));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("401 discovery challenge advertises supported read and optional write scopes", async () => {
    const result = await authenticateMcpRequest(new Request("https://plutao.test/api/mcp"));
    if (result.ok) throw new Error("expected unauthenticated request");
    const response = mcpUnauthorizedResponse(result);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata=\"https://plutao.test/.well-known/oauth-protected-resource\"");
    expect(response.headers.get("WWW-Authenticate")).toContain('scope="mcp:read mcp:write"');
  });

  it("does not elevate a write-scoped token when its grant has no write consent marker", async () => {
    mocks.claims = {
      sub: "user-1",
      scope: "mcp:read mcp:write",
      grant_id: "grant-1",
      client_id: "test-client",
    };
    mocks.getActiveGrantScopes.mockResolvedValue(["mcp:read"]);

    const result = await authenticateMcpRequest(new Request("https://plutao.test/api/mcp", {
      headers: { Authorization: "Bearer oauth-token" },
    }));

    expect(result).toMatchObject({ ok: true, scopes: ["mcp:read"] });
  });

  it("allows write only when both the token and persisted grant consent it", async () => {
    mocks.claims = {
      sub: "user-1",
      scope: "mcp:read mcp:write",
      grant_id: "grant-1",
      client_id: "test-client",
    };
    mocks.getActiveGrantScopes.mockResolvedValue(["mcp:read", "mcp:write"]);

    const result = await authenticateMcpRequest(new Request("https://plutao.test/api/mcp", {
      headers: { Authorization: "Bearer oauth-token" },
    }));

    expect(result).toMatchObject({ ok: true, scopes: ["mcp:read", "mcp:write"] });
  });

  it("fails closed with 503 when the persisted grant cannot be checked", async () => {
    mocks.claims = {
      sub: "user-1",
      scope: "mcp:read mcp:write",
      grant_id: "grant-1",
      client_id: "test-client",
    };
    mocks.getActiveGrantScopes.mockRejectedValue(new Error("column unavailable"));

    const result = await authenticateMcpRequest(new Request("https://plutao.test/api/mcp", {
      headers: { Authorization: "Bearer oauth-token" },
    }));

    expect(result).toMatchObject({ ok: false, status: 503 });
  });
});
