import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGithub } from "../github";
import * as connectorsService from "../../../connectors/service";
import * as cryptoService from "../../../connectors/crypto";

vi.mock("../../../connectors/service");
vi.mock("../../../connectors/crypto");

describe("GitHub Tool Execution & Capability Enforcement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return error on invalid JSON or unknown action", async () => {
    const res1 = await runGithub("not-json", "user-1");
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain("input deve ser JSON válido");
    }

    const res2 = await runGithub(JSON.stringify({ action: "invalid_action" }), "user-1");
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain("action inválida");
    }
  });

  it("should return error if connector is disconnected or missing", async () => {
    vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue(null as unknown as Awaited<ReturnType<typeof connectorsService.getConnectorRow>>);

    const res = await runGithub(JSON.stringify({ action: "repos_list" }), "user-1");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("GitHub não conectado");
    }
  });

  it("should return error if capability is not authorized in user connector row", async () => {
    vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      provider: "github",
      status: "connected",
      accessTokenEnc: "enc-token",
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      serverUrl: null,
      accountLogin: "octocat",
      accountLabel: "octocat",
      scopes: ["repo"],
      capabilities: [
        { name: "issues_list", kind: "rest_api", mode: "read" },
      ],
      oauthState: null,
      lastError: null,
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await runGithub(JSON.stringify({ action: "repos_list" }), "user-1");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Capability 'repos_list' não está autorizada");
    }
  });

  it("should refuse execution if capability mode === 'write' (Principle 1)", async () => {
    vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      provider: "github",
      status: "connected",
      accessTokenEnc: "enc-token",
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      serverUrl: null,
      accountLogin: "octocat",
      accountLabel: "octocat",
      scopes: ["repo"],
      capabilities: [
        { name: "issues_create", kind: "rest_api", mode: "write" },
      ],
      oauthState: null,
      lastError: null,
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await runGithub(
      JSON.stringify({ action: "repos_list" }),
      "user-1"
    );
    expect(res.ok).toBe(false);
  });

  it("should execute read capability successfully when authorized with valid token", async () => {
    vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      provider: "github",
      status: "connected",
      accessTokenEnc: "enc-token",
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      serverUrl: null,
      accountLogin: "octocat",
      accountLabel: "octocat",
      scopes: ["repo"],
      capabilities: [
        { name: "repos_list", kind: "rest_api", mode: "read" },
      ],
      oauthState: null,
      lastError: null,
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(cryptoService, "decryptToken").mockReturnValue("decrypted-github-token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          { full_name: "user/plutao-os", private: false, default_branch: "main" },
        ]),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await runGithub(JSON.stringify({ action: "repos_list" }), "user-1");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tool).toBe("github");
      expect(res.output).toContain("user/plutao-os");
      expect(res.output).not.toContain("decrypted-github-token");
      expect(typeof res.durationMs).toBe("number");
    }

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/user/repos?per_page=10&sort=updated",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer decrypted-github-token",
          "User-Agent": "Plutao-OS",
        }),
      })
    );
  });
});
