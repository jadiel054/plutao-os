import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGithub } from "../github";
import * as connectorsService from "../../../connectors/service";
import * as cryptoService from "../../../connectors/crypto";
import * as gatesService from "../../../connectors/gates";

vi.mock("../../../connectors/service");
vi.mock("../../../connectors/crypto");
vi.mock("../../../connectors/gates");

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
    vi.spyOn(cryptoService, "decryptToken").mockReturnValue("decrypted-github-token");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: "Capability 'repos_list' não está autorizada" }),
    });
    vi.stubGlobal("fetch", mockFetch);

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

  it("should create write_gate when write operation is requested without prior approval", async () => {
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
        { name: "github.files.write", kind: "rest_api", mode: "write" },
      ],
      oauthState: null,
      lastError: null,
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.spyOn(cryptoService, "decryptToken").mockReturnValue("decrypted-github-token");

    vi.spyOn(gatesService, "createWriteGate").mockResolvedValue({
      id: "gate-123",
      userId: "user-1",
      missionId: null,
      executionId: null,
      provider: "github",
      capability: "github.files.write",
      target: "octocat/hello-world",
      summary: "Push de 1 arquivo(s) em octocat/hello-world",
      payload: {},
      contentPreview: "- index.html (20 chars)",
      payloadHash: null,
      consumedAt: null,
      consumedBy: null,
      status: "pending",
      decision: null,
      decidedAt: null,
      executedAt: null,
      result: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await runGithub(
      JSON.stringify({
        action: "github.files.write",
        owner: "octocat",
        repo: "hello-world",
        files: [{ path: "index.html", content: "<h1>Hello World</h1>" }],
      }),
      "user-1"
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output).toContain("GATE_PENDING");
      expect(res.output).toContain("gate_id: gate-123");
    }
    expect(gatesService.createWriteGate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "github",
        capability: "github.files.write",
        target: "octocat/hello-world",
      })
    );
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
