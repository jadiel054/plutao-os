import { describe, expect, it, vi } from "vitest";
import { toolSystemStatus } from "../tools";

vi.mock("@/lib/connectors/service", () => ({
  listConnectorsForUser: vi.fn().mockResolvedValue([]),
}));

describe("toolSystemStatus", () => {
  it("reports 'OAuth 2.1 access token (PKCE)' when method is 'oauth'", async () => {
    const res = await toolSystemStatus("user-1", "oauth");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.mcp.auth).toBe("OAuth 2.1 access token (PKCE)");
  });

  it("reports 'ops API key (break-glass)' when method is 'ops_key'", async () => {
    const res = await toolSystemStatus("user-1", "ops_key");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.mcp.auth).toBe("ops API key (break-glass)");
  });

  it("falls back to 'bearer API key' when authMethod is undefined", async () => {
    const res = await toolSystemStatus("user-1");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.mcp.auth).toBe("bearer API key");
  });
});
