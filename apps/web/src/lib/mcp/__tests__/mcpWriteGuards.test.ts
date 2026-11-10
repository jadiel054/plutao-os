import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { userId: "user-1", scopes: ["mcp:read"] as string[], clientId: "client-1", grantId: "grant-1", method: "oauth" as "oauth" | "ops_key" },
  checkMcpRateLimit: vi.fn(),
  writeMcpAudit: vi.fn(),
  order: [] as string[],
}));

vi.mock("../auth", () => ({ getMcpAuth: () => mocks.auth }));
vi.mock("../audit", () => ({
  checkMcpRateLimit: mocks.checkMcpRateLimit,
  writeMcpAudit: mocks.writeMcpAudit,
}));

import { withMcpGuards } from "../tools";

const okResult = () => ({ content: [{ type: "text" as const, text: "done" }], isError: false });

describe("MCP write guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { userId: "user-1", scopes: ["mcp:read"], clientId: "client-1", grantId: "grant-1", method: "oauth" };
    mocks.checkMcpRateLimit.mockResolvedValue({ ok: true });
    mocks.writeMcpAudit.mockResolvedValue(true);
    mocks.order = [];
  });

  it("denies ops key even if its context is accidentally given mcp:write", async () => {
    mocks.auth = { ...mocks.auth, scopes: ["mcp:read", "mcp:write"], method: "ops_key" };
    const action = vi.fn(async () => okResult());

    const result = await withMcpGuards("plutao_create_mission", {}, action, { requiredScope: "mcp:write" });

    expect(result.isError).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(mocks.writeMcpAudit).toHaveBeenCalledWith(expect.objectContaining({ status: "forbidden" }));
  });

  it("fails closed when the start audit cannot be persisted", async () => {
    mocks.auth = { ...mocks.auth, scopes: ["mcp:read", "mcp:write"] };
    mocks.writeMcpAudit.mockResolvedValueOnce(false);
    const action = vi.fn(async () => okResult());

    const result = await withMcpGuards("plutao_create_mission", {}, action, { requiredScope: "mcp:write" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("audit_unavailable");
    expect(action).not.toHaveBeenCalled();
  });

  it("records a successful start before running the write action", async () => {
    mocks.auth = { ...mocks.auth, scopes: ["mcp:read", "mcp:write"] };
    mocks.writeMcpAudit.mockImplementation(async (input: { status: string }) => {
      mocks.order.push(`audit:${input.status}`);
      return true;
    });
    const action = vi.fn(async () => {
      mocks.order.push("effect");
      return okResult();
    });

    const result = await withMcpGuards("plutao_create_mission", {}, action, { requiredScope: "mcp:write" });

    expect(result.isError).toBe(false);
    expect(mocks.order).toEqual(["audit:started", "effect", "audit:ok"]);
  });
});
