import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isQueryBlocklisted,
  supabaseListProjects,
  supabaseListTables,
  supabaseTableRead,
  supabaseSqlExec,
} from "../supabaseWrite";
import { runSupabase } from "@/lib/runtime/tools/supabase";
import * as connectorsService from "../service";
import * as gatesService from "../gates";

vi.mock("../service", () => ({
  getConnectorRow: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("../gates", () => ({
  createWriteGate: vi.fn(),
}));

describe("Supabase Connector & Tool", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("isQueryBlocklisted", () => {
    it("allows standard SELECT, INSERT, UPDATE, DELETE, CREATE TABLE statements", () => {
      expect(isQueryBlocklisted("SELECT * FROM users")).toBe(false);
      expect(isQueryBlocklisted("INSERT INTO logs (msg) VALUES ('test')")).toBe(false);
      expect(isQueryBlocklisted("CREATE TABLE items (id uuid primary key)")).toBe(false);
      expect(isQueryBlocklisted("ALTER TABLE users ADD COLUMN name text")).toBe(false);
      expect(isQueryBlocklisted("DROP TABLE temp_data")).toBe(false);
    });

    it("rejects DROP / TRUNCATE / ALTER on DATABASE or SCHEMA", () => {
      expect(isQueryBlocklisted("DROP DATABASE prod_db")).toBe(true);
      expect(isQueryBlocklisted("drop schema public cascade")).toBe(true);
      expect(isQueryBlocklisted("TRUNCATE DATABASE my_db")).toBe(true);
      expect(isQueryBlocklisted("TRUNCATE SCHEMA public")).toBe(true);
      expect(isQueryBlocklisted("ALTER DATABASE postgres SET timezone TO 'UTC'")).toBe(true);
      expect(isQueryBlocklisted("ALTER SCHEMA public RENAME TO old_public")).toBe(true);
    });
  });

  describe("supabaseListProjects", () => {
    it("returns formatted projects list", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { id: "proj-1", ref: "xyz123456789", name: "Meu App", region: "sa-east-1", status: "ACTIVE_HEALTHY" },
          ]),
      } as Response);

      const res = await supabaseListProjects({ accessToken: "sbp_test123" });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("Meu App");
        expect(res.output).toContain("xyz123456789");
        expect(res.output).toContain("sa-east-1");
      }
    });

    it("translates 401 unauthenticated error to PT-BR", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "Invalid JWT" }),
      } as Response);

      const res = await supabaseListProjects({ accessToken: "sbp_bad" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Acesso não autorizado ao Supabase");
      }
    });
  });

  describe("supabaseTableRead", () => {
    it("rejects non-SELECT query parameters with clear PT-BR message", async () => {
      const res = await supabaseTableRead(
        { accessToken: "sbp_test123" },
        { projectRef: "xyz123456789", table: "users", select: "id; DELETE FROM users;" }
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Operação recusada: table_read permite apenas consultas SELECT.");
      }
    });

    it("caps limit to max 100 rows", async () => {
      let requestedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 1 }, { id: 2 }],
        } as Response;
      });

      const res = await supabaseTableRead(
        { accessToken: "sbp_test123" },
        { projectRef: "xyz123456789", table: "users", limit: 500 }
      );

      expect(res.ok).toBe(true);
      expect(requestedUrl).toContain("limit=100");
    });
  });

  describe("supabaseSqlExec", () => {
    it("rejects queries exceeding 10,000 characters", async () => {
      const hugeQuery = "SELECT " + "a".repeat(10005);
      const res = await supabaseSqlExec(
        { accessToken: "sbp_test123" },
        "xyz123456789",
        hugeQuery
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Query excede o limite máximo de 10.000 caracteres.");
      }
    });

    it("rejects blocklisted queries", async () => {
      const res = await supabaseSqlExec(
        { accessToken: "sbp_test123" },
        "xyz123456789",
        "DROP SCHEMA public CASCADE;"
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("proibidos pela política de segurança do Supabase");
      }
    });

    it("executes valid SQL query via Management API when approved", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ result: "ok" }]),
      } as Response);

      const res = await supabaseSqlExec(
        { accessToken: "sbp_test123" },
        "xyz123456789",
        "CREATE TABLE test (id int);"
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("SQL executado com sucesso");
      }
    });
  });

  describe("runSupabase (Tool Runtime & Write Gate)", () => {
    it("creates Write Gate and stops at GATE_PENDING when sql_exec is called without approval", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        provider: "supabase",
        status: "connected",
        serverUrl: null,
        accountLogin: "sb-user",
        accountLabel: "sb-user",
        scopes: [],
        capabilities: [],
        accessTokenEnc: "enc-token",
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        oauthState: null,
        lastError: null,
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("sbp_valid_token");

      vi.spyOn(gatesService, "createWriteGate").mockResolvedValue({
        id: "gate-12345",
        userId: "user-1",
        missionId: null,
        executionId: null,
        provider: "supabase",
        capability: "sql_exec",
        target: "project:xyz123456789",
        summary: 'Executar SQL no projeto Supabase "xyz123456789"',
        payload: { action: "sql_exec", projectRef: "xyz123456789", query: "INSERT INTO users (name) VALUES ('Alice')" },
        contentPreview: "INSERT INTO users (name) VALUES ('Alice')",
        status: "pending",
        decision: null,
        decidedAt: null,
        executedAt: null,
        result: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const longQuery = "INSERT INTO users (name) VALUES ('" + "X".repeat(300) + "')";

      const inputJson = JSON.stringify({
        action: "sql_exec",
        projectRef: "xyz123456789",
        query: longQuery,
      });

      const res = await runSupabase(inputJson, "user-1");

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("GATE_PENDING");
        expect(res.output).toContain("gate_id: gate-12345");
        expect(gatesService.createWriteGate).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: "supabase",
            capability: "sql_exec",
            contentPreview: expect.stringMatching(/^INSERT INTO users/),
          })
        );
        // Verify content preview is truncated to max 200 chars
        const gateCall = vi.mocked(gatesService.createWriteGate).mock.calls[0]?.[0];
        expect(gateCall?.contentPreview?.length).toBeLessThanOrEqual(200);
      }
    });

    it("returns error if connector is disconnected", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue(null as never);

      const res = await runSupabase(
        JSON.stringify({ action: "projects_list" }),
        "user-1"
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Supabase não conectado");
      }
    });
  });
});
