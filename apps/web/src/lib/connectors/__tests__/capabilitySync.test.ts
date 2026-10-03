import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultCapabilities } from "../connectorOAuth";

// Mock DB module
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: mockSelect,
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        mockSet(vals);
        return {
          where: mockWhere,
        };
      },
    }),
  }),
}));

import { listConnectorsForUser } from "../service";

describe("Connector Capability Sync on Load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("silently re-syncs diverging capabilities for connected connector rows without touching tokens or status", async () => {
    const userId = "user-test-123";
    const githubDefaults = getDefaultCapabilities("github");
    expect(githubDefaults.length).toBeGreaterThan(0);

    // Stored row has only 1 stale capability
    const staleCapabilities = [{ name: "repos_list", description: "old desc", kind: "rest_api", mode: "read" }];
    const fakeDbRow = {
      id: "conn-123",
      userId,
      provider: "github",
      status: "connected",
      serverUrl: null,
      accountLogin: "octocat",
      accountLabel: "octocat",
      capabilities: staleCapabilities,
      scopes: ["repo"],
      accessTokenEnc: "encrypted_access_token",
      refreshTokenEnc: "encrypted_refresh_token",
      tokenExpiresAt: null,
      oauthState: null,
      lastError: null,
      connectedAt: new Date("2025-01-01T00:00:00Z"),
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    };

    mockSelect.mockResolvedValue([fakeDbRow]);
    mockWhere.mockResolvedValue([fakeDbRow]);

    const result = await listConnectorsForUser(userId);

    // Verify DB update was triggered
    expect(mockSet).toHaveBeenCalledTimes(1);
    const updatedValues = mockSet.mock.calls[0][0];

    // DB update MUST include updated capabilities matching manifest defaults
    expect(updatedValues.capabilities).toEqual(githubDefaults);
    expect(updatedValues.updatedAt).toBeInstanceOf(Date);

    // DB update MUST NOT include status, tokens, or other fields
    expect(updatedValues.status).toBeUndefined();
    expect(updatedValues.accessTokenEnc).toBeUndefined();
    expect(updatedValues.refreshTokenEnc).toBeUndefined();

    // The returned connector public view has updated capabilities
    const githubResult = result.find((c) => c.provider === "github");
    expect(githubResult).toBeDefined();
    expect(githubResult?.status).toBe("connected");
    expect(githubResult?.capabilities).toEqual(githubDefaults);
  });

  it("does not trigger DB update if capabilities are already in sync with manifest", async () => {
    const userId = "user-test-123";
    const githubDefaults = getDefaultCapabilities("github");

    const syncedDbRow = {
      id: "conn-123",
      userId,
      provider: "github",
      status: "connected",
      serverUrl: null,
      accountLogin: "octocat",
      accountLabel: "octocat",
      capabilities: githubDefaults,
      scopes: ["repo"],
      accessTokenEnc: "encrypted_access_token",
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      oauthState: null,
      lastError: null,
      connectedAt: new Date("2025-01-01T00:00:00Z"),
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    };

    mockSelect.mockResolvedValue([syncedDbRow]);

    const result = await listConnectorsForUser(userId);

    expect(mockSet).not.toHaveBeenCalled();
    const githubResult = result.find((c) => c.provider === "github");
    expect(githubResult?.capabilities).toEqual(githubDefaults);
  });

  it("does not re-sync capabilities for disconnected connector rows", async () => {
    const userId = "user-test-123";

    const disconnectedDbRow = {
      id: "conn-123",
      userId,
      provider: "github",
      status: "disconnected",
      serverUrl: null,
      accountLogin: null,
      accountLabel: null,
      capabilities: [],
      scopes: [],
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      oauthState: null,
      lastError: null,
      connectedAt: null,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    };

    mockSelect.mockResolvedValue([disconnectedDbRow]);

    const result = await listConnectorsForUser(userId);

    expect(mockSet).not.toHaveBeenCalled();
    const githubResult = result.find((c) => c.provider === "github");
    expect(githubResult?.status).toBe("disconnected");
    expect(githubResult?.capabilities).toEqual([]);
  });
});
