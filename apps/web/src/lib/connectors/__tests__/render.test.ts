import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyToken } from "../connectorOAuth";
import {
  maskValue,
  renderServicesList,
  renderServiceGet,
  renderDeploysList,
  renderDeployTrigger,
  renderEnvSet,
} from "../renderWrite";
import { runRender } from "@/lib/runtime/tools/render";
import * as connectorsService from "../service";
import * as gatesService from "../gates";

vi.mock("../service", () => ({
  getConnectorRow: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("../gates", () => ({
  createWriteGate: vi.fn(),
}));

describe("Render Connector & Tools Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("maskValue helper", () => {
    it("masks values <= 4 chars with ****", () => {
      expect(maskValue("123")).toBe("****");
      expect(maskValue("abcd")).toBe("****");
    });

    it("masks values > 4 chars showing first 2 and last 2 chars", () => {
      expect(maskValue("my_secret_key")).toBe("my***ey");
      expect(maskValue("secret")).toBe("se***et");
    });
  });

  describe("verifyToken (Render)", () => {
    it("successfully verifies active API Key", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { owner: { id: "usr-12345", name: "Jadiel Alves", email: "jadiel@example.com" } },
        ],
      } as Response);

      const res = await verifyToken("render", "rnd_valid_token_123");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.login).toBe("Jadiel Alves");
      }
    });

    it("returns error for invalid token or API error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          message: "Unauthorized",
        }),
      } as Response);

      const res = await verifyToken("render", "rnd_bad_token");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Unauthorized");
      }
    });
  });

  describe("renderServicesList", () => {
    it("lists services up to 50 items with name, type, repo, url live, status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              service: {
                id: "srv-c123456",
                name: "plutao-api",
                type: "web_service",
                repo: "https://github.com/jadiel054/plutao-os",
                serviceDetails: { url: "https://plutao-api.onrender.com" },
                suspended: "not_suspended",
                status: "live",
              },
            },
            {
              service: {
                id: "srv-c999999",
                name: "plutao-cron",
                type: "cron_job",
                repo: "https://github.com/jadiel054/cron",
                suspended: "suspended",
              },
            },
          ]),
      } as Response);

      const res = await renderServicesList("valid_token");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("plutao-api");
        expect(res.output).toContain("web_service");
        expect(res.output).toContain("https://plutao-api.onrender.com");
        expect(res.output).toContain("status: live");
        expect(res.output).toContain("plutao-cron");
        expect(res.output).toContain("status: suspended");
      }
    });
  });

  describe("renderServiceGet", () => {
    it("fetches service details and environment variable keys without values", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/services/srv-123/env-vars")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify([
                { envVar: { key: "DATABASE_URL", value: "postgres://secret:password@host/db" } },
                { envVar: { key: "PORT", value: "3000" } },
              ]),
          } as Response;
        }
        if (url.includes("/services/srv-123")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                service: {
                  id: "srv-123",
                  name: "my-web-app",
                  type: "web_service",
                  repo: "https://github.com/user/app",
                  serviceDetails: { url: "https://my-web-app.onrender.com" },
                  suspended: "not_suspended",
                },
              }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const res = await renderServiceGet("valid_token", "srv-123");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("my-web-app");
        expect(res.output).toContain("DATABASE_URL");
        expect(res.output).toContain("PORT");
        // Ensure values are NOT present in output!
        expect(res.output).not.toContain("postgres://secret:password@host/db");
        expect(res.output).not.toContain("3000");
      }
    });
  });

  describe("renderDeploysList", () => {
    it("lists up to 20 last deploys for a service", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              deploy: {
                id: "dep-d12345",
                status: "live",
                commit: { id: "a1b2c3d4e5", message: "feat: add render connector" },
                createdAt: "2026-03-01T10:00:00Z",
              },
            },
          ]),
      } as Response);

      const res = await renderDeploysList("valid_token", "srv-123");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("dep-d12345");
        expect(res.output).toContain("live");
        expect(res.output).toContain("a1b2c3d");
        expect(res.output).toContain("feat: add render connector");
      }
    });
  });

  describe("runRender & Write Gates", () => {
    it("creates Write Gate for deploy_trigger without _gateApproved", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "u1",
        provider: "render",
        status: "connected",
        serverUrl: null,
        accountLogin: "Jadiel Alves",
        accountLabel: null,
        scopes: [],
        capabilities: [],
        accessTokenEnc: "enc",
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        oauthState: null,
        lastError: null,
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("rnd_tok123");
      vi.spyOn(gatesService, "createWriteGate").mockResolvedValue({
        id: "gate-rnd-1",
        userId: "u1",
        missionId: null,
        executionId: null,
        provider: "render",
        capability: "deploy_trigger",
        target: "services/srv-123/deploys",
        summary: 'Disparar deploy para o serviço "srv-123"',
        payload: {},
        contentPreview: null,
        status: "pending",
        decision: null,
        decidedAt: null,
        executedAt: null,
        result: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const input = JSON.stringify({
        action: "deploy_trigger",
        service_id: "srv-123",
        clear_cache: true,
      });

      const res = await runRender(input, "u1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("GATE_PENDING");
        expect(res.output).toContain("gate_id: gate-rnd-1");
      }
    });

    it("creates Write Gate for env_set with value masked in preview", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "u1",
        provider: "render",
        status: "connected",
        serverUrl: null,
        accountLogin: "Jadiel Alves",
        accountLabel: null,
        scopes: [],
        capabilities: [],
        accessTokenEnc: "enc",
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        oauthState: null,
        lastError: null,
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("rnd_tok123");

      let gatePreview = "";
      vi.spyOn(gatesService, "createWriteGate").mockImplementation(async (input) => {
        gatePreview = input.contentPreview || "";
        return {
          id: "gate-rnd-2",
          userId: input.userId,
          missionId: null,
          executionId: null,
          provider: "render",
          capability: input.capability,
          target: input.target,
          summary: input.summary,
          payload: input.payload,
          contentPreview: input.contentPreview,
          status: "pending",
          decision: null,
          decidedAt: null,
          executedAt: null,
          result: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const input = JSON.stringify({
        action: "env_set",
        service_id: "srv-123",
        key: "SECRET_TOKEN",
        value: "super_secret_value_123",
      });

      const res = await runRender(input, "u1");
      expect(res.ok).toBe(true);
      expect(gatePreview).toContain("Valor: su***23");
      expect(gatePreview).not.toContain("super_secret_value_123");
    });

    it("executes env_set when _gateApproved is true", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "u1",
        provider: "render",
        status: "connected",
        serverUrl: null,
        accountLogin: "Jadiel Alves",
        accountLabel: null,
        scopes: [],
        capabilities: [],
        accessTokenEnc: "enc",
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        oauthState: null,
        lastError: null,
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("rnd_tok123");

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ key: "SECRET_TOKEN", value: "super_secret_value_123" }]),
      } as Response);

      const input = JSON.stringify({
        action: "env_set",
        service_id: "srv-123",
        key: "SECRET_TOKEN",
        value: "super_secret_value_123",
        _gateApproved: true,
      });

      const res = await runRender(input, "u1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("Variável de ambiente definida com sucesso!");
        expect(res.output).toContain("Valor: `su***23`");
      }
    });
  });
});
