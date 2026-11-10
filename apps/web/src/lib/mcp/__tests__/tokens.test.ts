import { afterEach, describe, expect, it } from "vitest";
import { issueAccessToken, normalizeGrantedScopes, normalizeScopes, verifyAccessToken } from "../tokens";

const originalSecret = process.env.MCP_TOKEN_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.MCP_TOKEN_SECRET;
  else process.env.MCP_TOKEN_SECRET = originalSecret;
});

describe("MCP scopes", () => {
  it("defaults to read-only and grants write only when the explicit option is set", () => {
    expect(normalizeScopes(undefined)).toBe("mcp:read");
    expect(normalizeScopes("mcp:write")).toBe("mcp:read");
    expect(normalizeScopes("mcp:read mcp:write")).toBe("mcp:read");
    expect(normalizeScopes("mcp:write", { allowWrite: true })).toBe("mcp:read mcp:write");
    expect(normalizeScopes("mcp:read mcp:unknown mcp:write", { allowWrite: true })).toBe("mcp:read mcp:write");
  });

  it("keeps grants without a persisted write-consent marker read-only", () => {
    expect(normalizeGrantedScopes("mcp:read mcp:write", null)).toBe("mcp:read");
    expect(normalizeGrantedScopes("mcp:read mcp:write", undefined)).toBe("mcp:read");
    expect(normalizeGrantedScopes("mcp:read mcp:write", new Date())).toBe("mcp:read mcp:write");
  });

  it("clamps issuance by default and preserves write only with explicit consent", () => {
    process.env.MCP_TOKEN_SECRET = "temporary-test-secret-with-sufficient-length";
    const defaultIssued = issueAccessToken({
      userId: "user-1",
      clientId: "legacy-client",
      scope: "mcp:read mcp:write",
      grantId: "grant-1",
    });
    expect(defaultIssued.scope).toBe("mcp:read");

    const issued = issueAccessToken({
      userId: "user-1",
      clientId: "consented-client",
      scope: "mcp:read mcp:write",
      grantId: "grant-1",
      allowWrite: true,
    });
    const verified = verifyAccessToken(issued.accessToken);

    expect(issued.scope).toBe("mcp:read mcp:write");
    expect(verified?.scope).toBe("mcp:read mcp:write");
  });
});
