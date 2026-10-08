import { describe, expect, it, vi } from "vitest";
import { toolSystemStatus } from "../tools";

vi.mock("@/lib/connectors/service", () => ({
  listConnectorsForUser: vi.fn().mockResolvedValue([]),
}));

const mockAuth = {
  userId: "user-1",
  scopes: ["mcp:read"] as string[],
  clientId: "test-client",
  grantId: "grant-1",
  method: "oauth" as const,
};

vi.mock("../auth", () => ({
  getMcpAuth: () => mockAuth,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  }),
}));

describe("toolSystemStatus", () => {
  it("reports OAuth PKCE authentication and read-only capabilities", async () => {
    const response = await toolSystemStatus("user-1", "oauth");
    const result = JSON.parse(response.content[0].text);
    expect(result.mcp.auth).toBe("OAuth 2.1 access token (PKCE)");
    expect(result.mcp.writeTools).toBe(false);
    expect(result.mcp.scopesSupported).toEqual(["mcp:read"]);
  });

  it("reports the ops key as read-only", async () => {
    const response = await toolSystemStatus("user-1", "ops_key");
    const result = JSON.parse(response.content[0].text);
    expect(result.mcp.auth).toBe("ops API key (read-only)");
    expect(result.mcp.writeTools).toBe(false);
  });

  it("masks provider/model internals", async () => {
    const response = await toolSystemStatus("user-1", "oauth");
    const result = JSON.parse(response.content[0].text);
    expect(result.model).toBe("plutao-primary");
    expect(result.model?.providerEnv).toBeUndefined();
    expect(result.model?.nameEnv).toBeUndefined();
  });
});
