import { afterEach, describe, expect, it } from "vitest";
import { issueAccessToken, normalizeScopes, verifyAccessToken } from "../tokens";

const originalSecret = process.env.MCP_TOKEN_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.MCP_TOKEN_SECRET;
  else process.env.MCP_TOKEN_SECRET = originalSecret;
});

describe("MCP scopes", () => {
  it("defaults and clamps every requested scope to read-only", () => {
    expect(normalizeScopes(undefined)).toBe("mcp:read");
    expect(normalizeScopes("mcp:write")).toBe("mcp:read");
    expect(normalizeScopes("mcp:read mcp:write")).toBe("mcp:read");
  });

  it("does not reissue mcp:write from an older persisted grant", () => {
    process.env.MCP_TOKEN_SECRET = "temporary-test-secret-with-sufficient-length";
    const issued = issueAccessToken({
      userId: "user-1",
      clientId: "legacy-client",
      scope: "mcp:read mcp:write",
      grantId: "grant-1",
    });
    const verified = verifyAccessToken(issued.accessToken);

    expect(issued.scope).toBe("mcp:read");
    expect(verified?.scope).toBe("mcp:read");
  });
});
