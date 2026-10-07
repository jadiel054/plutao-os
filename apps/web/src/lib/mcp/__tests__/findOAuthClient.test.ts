import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { limit, where, from, select };
});

vi.mock("@plutao/db", () => ({
  createDb: () => ({ select: mocks.select }),
  mcpAuthCodes: {},
  mcpOauthClients: { clientId: "client_id" },
  mcpOauthGrants: {},
  mcpOauthRegistrationLimits: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(() => ({})),
  isNull: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}));

import { findOAuthClient } from "../grants";

describe("findOAuthClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null and logs when the migration table does not yet exist", async () => {
    mocks.limit.mockRejectedValue(Object.assign(new Error('relation "mcp_oauth_clients" does not exist'), { code: "42P01" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(findOAuthClient("legacy-client")).resolves.toBeNull();

    expect(log).toHaveBeenCalledOnce();
  });

  it("returns null and logs when the query fails for another reason", async () => {
    mocks.limit.mockRejectedValue(new Error("database connection timeout"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(findOAuthClient("legacy-client")).resolves.toBeNull();

    expect(log).toHaveBeenCalledOnce();
  });
});
