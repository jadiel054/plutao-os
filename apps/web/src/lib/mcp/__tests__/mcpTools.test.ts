import { describe, expect, it, vi, beforeEach } from "vitest";
import { toolSystemStatus, toolSendMessage } from "../tools";
import { __resetMcpRateLimitForTests } from "../audit";

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
  hasMcpScope: (s: string) => mockAuth.scopes.includes(s),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  }),
}));

vi.mock("@/lib/runtime/model/config", () => ({
  getModelConfig: () => null,
}));

vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: vi.fn(),
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

  it("masks model as plutao-primary without providerEnv", async () => {
    const res = await toolSystemStatus("user-1", "oauth");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.model).toBe("plutao-primary");
    expect(parsed.model?.providerEnv).toBeUndefined();
    expect(parsed.model?.nameEnv).toBeUndefined();
  });
});

describe("toolSendMessage scope gate", () => {
  beforeEach(() => {
    mockAuth.scopes = ["mcp:read"];
    __resetMcpRateLimitForTests();
  });

  it("returns forbidden without mcp:write", async () => {
    const res = await toolSendMessage("user-1", { content: "olá" });
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toBe("forbidden");
    expect(String(parsed.message)).toMatch(/mcp:write/);
  });

  it("rejects empty content even with write scope", async () => {
    mockAuth.scopes = ["mcp:read", "mcp:write"];
    const res = await toolSendMessage("user-1", { content: "   " });
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toBe("content obrigatório");
  });

  it("rejects content over 4000 chars", async () => {
    mockAuth.scopes = ["mcp:read", "mcp:write"];
    const res = await toolSendMessage("user-1", { content: "x".repeat(4001) });
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toBe("content_too_long");
  });
});
