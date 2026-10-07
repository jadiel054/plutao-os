import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyToken } from "../connectorOAuth";
import {
  cloudflareListZones,
  cloudflareListDnsRecords,
  cloudflareListPagesProjects,
  cloudflareListWorkers,
  cloudflareCreateDnsRecord,
  cloudflareDeployPages,
} from "../cloudflareWrite";
import { runCloudflare } from "@/lib/runtime/tools/cloudflare";
import * as connectorsService from "../service";
import * as gatesService from "../gates";

vi.mock("../service", () => ({
  getConnectorRow: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("../gates", () => ({
  createWriteGate: vi.fn(),
  consumeGateForWrite: vi.fn(),
  finalizeGateExecution: vi.fn(),
}));

describe("Cloudflare Connector & Tools Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("verifyToken (Cloudflare)", () => {
    it("successfully verifies active API Token", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: { id: "1234567890abcdef", status: "active" },
          errors: [],
          messages: [],
        }),
      } as Response);

      const res = await verifyToken("cloudflare", "cf_valid_token_123");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.login).toBe("cf-12345678");
      }
    });

    it("returns error for invalid token or API error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          errors: [{ code: 10000, message: "Authentication error" }],
        }),
      } as Response);

      const res = await verifyToken("cloudflare", "cf_bad_token");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Authentication error");
      }
    });
  });

  describe("cloudflareListZones", () => {
    it("lists zones up to 50 items", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            result: [
              { id: "zone1", name: "example.com", status: "active" },
              { id: "zone2", name: "test.org", status: "active" },
            ],
          }),
      } as Response);

      const res = await cloudflareListZones("valid_token");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("example.com");
        expect(res.output).toContain("test.org");
        expect(res.output).toContain("zone1");
      }
    });
  });

  describe("cloudflareListDnsRecords", () => {
    it("lists DNS records for a given zone_id", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            result: [
              { id: "rec1", type: "A", name: "app.example.com", content: "1.2.3.4", proxied: true },
            ],
          }),
      } as Response);

      const res = await cloudflareListDnsRecords("valid_token", "zone1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("app.example.com");
        expect(res.output).toContain("1.2.3.4");
        expect(res.output).toContain("proxied: sim");
      }
    });

    it("returns PT-BR error if zone_id is missing", async () => {
      const res = await cloudflareListDnsRecords("valid_token", " ");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("zone_id");
      }
    });
  });

  describe("cloudflareListPagesProjects & cloudflareListWorkers", () => {
    it("resolves accountId and lists Pages projects", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/accounts?")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true, result: [{ id: "acc123" }] }),
          } as Response;
        }
        if (url.includes("/pages/projects")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                success: true,
                result: [{ name: "my-pages-app", subdomain: "my-pages-app.pages.dev" }],
              }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const res = await cloudflareListPagesProjects("valid_token");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("my-pages-app");
        expect(res.output).toContain("https://my-pages-app.pages.dev");
      }
    });

    it("resolves accountId and lists Workers scripts", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/accounts?")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true, result: [{ id: "acc123" }] }),
          } as Response;
        }
        if (url.includes("/workers/scripts")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                success: true,
                result: [{ id: "my-worker-bot", modified_on: "2026-10-01" }],
              }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const res = await cloudflareListWorkers("valid_token");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("my-worker-bot");
      }
    });
  });

  describe("runCloudflare & Write Gates", () => {
    it("creates Write Gate for write action (dns_record_create) without _gateApproved", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "u1",
        provider: "cloudflare",
        status: "connected",
        serverUrl: null,
        accountLogin: "cf-12345",
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
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("tok123");
      vi.spyOn(gatesService, "createWriteGate").mockResolvedValue({
        id: "gate-cf-1",
        userId: "u1",
        missionId: null,
        executionId: null,
        provider: "cloudflare",
        capability: "dns_record_create",
        target: "zones/z1/dns_records",
        summary: "Criar registro DNS A sub -> 1.1.1.1",
        payload: {},
        contentPreview: null,
        payloadHash: null,
        consumedAt: null,
        consumedBy: null,
        status: "pending",
    expiresAt: new Date(Date.now() + 900_000),
        decision: null,
        decidedAt: null,
        executedAt: null,
        result: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const input = JSON.stringify({
        action: "dns_record_create",
        zone_id: "z1",
        type: "A",
        name: "sub",
        content: "1.1.1.1",
      });

      const res = await runCloudflare(input, "u1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("GATE_PENDING");
        expect(res.output).toContain("gate_id: gate-cf-1");
      }
    });

    it("recusa escrita sem gate aprovado — `_gateApproved` é ignorado (fail-closed)", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "u1",
        provider: "cloudflare",
        status: "connected",
        serverUrl: null,
        accountLogin: "acc",
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
      } as never);
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("tok123");
      vi.spyOn(gatesService, "createWriteGate").mockResolvedValue({ id: "gate-cf-pending" } as never);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            result: { id: "dns_new_123", type: "A", name: "sub", content: "1.1.1.1" },
          }),
      } as Response);

      const input = JSON.stringify({
        action: "dns_record_create",
        zone_id: "z1",
        type: "A",
        name: "sub",
        content: "1.1.1.1",
        _gateApproved: true,
      });
      const res = await runCloudflare(input, "u1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("GATE_PENDING");
      }
      // Nada foi executado: a flag antiga não autoriza mais nada.
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("executa a escrita quando o gate aprovado é consumido no servidor", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "u1",
        provider: "cloudflare",
        status: "connected",
        serverUrl: null,
        accountLogin: "acc",
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
      } as never);
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("tok123");
      vi.mocked(gatesService.consumeGateForWrite).mockResolvedValue({
        ok: true,
        gate: { id: "gate-cf-1", status: "executing" },
      } as never);
      vi.mocked(gatesService.finalizeGateExecution).mockResolvedValue(null as never);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            result: { id: "dns_new_123", type: "A", name: "sub", content: "1.1.1.1" },
          }),
      } as Response);

      const input = JSON.stringify({
        action: "dns_record_create",
        zone_id: "z1",
        type: "A",
        name: "sub",
        content: "1.1.1.1",
        _gateId: "gate-cf-1",
      });
      const res = await runCloudflare(input, "u1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("Registro DNS criado com sucesso");
        expect(res.output).toContain("dns_new_123");
      }
      expect(gatesService.consumeGateForWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          gateId: "gate-cf-1",
          provider: "cloudflare",
          capability: "dns_record_create",
          payloadHash: expect.any(String),
        })
      );
    });
  });
});
