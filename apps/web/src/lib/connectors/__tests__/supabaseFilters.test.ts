/**
 * H4 — `supabase.table_read` concatenava `where` bruto (injeção) e `sql_exec`
 * precisa exigir gate no ponto público.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchCalls: string[] = [];

vi.mock("@/lib/connectors/service", () => ({
  getConnectorRow: async () => ({ id: "conn-1", status: "connected" }),
}));

vi.mock("@/lib/connectors/supabaseWrite", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getSupabaseCredentials: async () => ({
      projectRef: "abcdefghijklmnop",
      accessToken: "sbp_test_token",
      url: "https://abcdefghijklmnop.supabase.co",
    }),
    supabaseListProjects: async () => ({ output: "[]" }),
    supabaseListTables: async () => ({ output: "[]" }),
    supabaseSqlExec: async () => {
      throw new Error("sql_exec NÃO deveria ser chamado sem gate aprovado");
    },
  };
});

vi.mock("@/lib/connectors/writeGateGuard", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    guardWrite: async () => ({
      kind: "gate_pending",
      gateId: "gate-1",
      output: "GATE_PENDING: aguardando aprovação humana",
    }),
  };
});

vi.stubGlobal("fetch", async (url: string) => {
  fetchCalls.push(String(url));
  return {
    ok: true,
    status: 200,
    text: async () => "[]",
    json: async () => [],
  };
});

import {
  parseTableFilters,
  validateSelect,
  validateTableName,
} from "../supabaseFilters";
import { runSupabase } from "@/lib/runtime/tools/supabase";

const USER = "11111111-1111-4111-8111-111111111111";

describe("H4 — filtros estruturados do Supabase", () => {
  it("aceita filtro estruturado simples", () => {
    const res = parseTableFilters("status=eq.ativo");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.filters).toEqual([{ column: "status", operator: "eq", value: "ativo" }]);
    }
  });

  it("recusa parâmetros reservados do PostgREST (select/limit/order/or/and)", () => {
    for (const bad of [
      "limit=eq.1",
      "select=eq.*",
      "order=eq.id",
      "or=(a.eq.1,b.eq.2)",
      "and=(a.eq.1)",
      "offset=eq.0",
      "on_conflict=eq.id",
    ]) {
      expect(parseTableFilters(bad).ok, `deveria recusar: ${bad}`).toBe(false);
    }
  });

  it("recusa operador fora da allowlist", () => {
    expect(parseTableFilters("status=drop.ativo").ok).toBe(false);
  });

  it("recusa coluna que não é identificador", () => {
    expect(parseTableFilters("status);drop=eq.x").ok).toBe(false);
    expect(parseTableFilters("a/b=eq.x").ok).toBe(false);
  });

  it("valida nome de tabela", () => {
    expect(validateTableName("users").ok).toBe(true);
    for (const bad of ["", "users;drop", "users/../x", "a b", "*"]) {
      expect(validateTableName(bad).ok, `deveria recusar: ${bad}`).toBe(false);
    }
  });

  it("valida select (apenas colunas, sem escrita)", () => {
    expect(validateSelect("id,name").ok).toBe(true);
    expect(validateSelect("*").ok).toBe(true);
    for (const bad of ["*; drop table users", "select * from x", "a)", "id;delete", "id)("]) {
      expect(validateSelect(bad).ok, `deveria recusar: ${bad}`).toBe(false);
    }
  });
});

describe("H4 — sql_exec exige gate no ponto público", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
  });

  it("sql_exec sem gate NÃO executa HTTP e devolve GATE_PENDING", async () => {
    const res = await runSupabase(
      JSON.stringify({
        action: "sql_exec",
        projectRef: "abcdefghijklmnop",
        query: "DROP TABLE users",
      }),
      USER
    );

    expect(JSON.stringify(res)).toContain("GATE_PENDING");
    expect(fetchCalls.length).toBe(0);
  });

  it("sql_exec ignora `_gateApproved` (booleano não autoriza)", async () => {
    const res = await runSupabase(
      JSON.stringify({
        action: "sql_exec",
        projectRef: "abcdefghijklmnop",
        query: "DROP TABLE users",
        _gateApproved: true,
      }),
      USER
    );

    expect(JSON.stringify(res)).toContain("GATE_PENDING");
    expect(fetchCalls.length).toBe(0);
  });

  it("table_read com where reservado é recusado", async () => {
    const res = await runSupabase(
      JSON.stringify({
        action: "table_read",
        projectRef: "abcdefghijklmnop",
        table: "users",
        where: "limit=eq.1&select=*",
      }),
      USER
    );
    expect(JSON.stringify(res)).toMatch(/reservado|inválido|INVALID/i);
  });

  it("valor de filtro é transportado como parâmetro — não sobrescreve select/limit", async () => {
    fetchCalls.length = 0;
    await runSupabase(
      JSON.stringify({
        action: "table_read",
        projectRef: "abcdefghijklmnop",
        table: "users",
        where: "status=eq.a%26limit=999",
      }),
      USER
    );

    expect(fetchCalls.length).toBe(1);
    const url = new URL(fetchCalls[0]);
    // o `%26limit=999` do valor NÃO pode virar o parâmetro reservado limit
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("select")).toBe("*");
    expect(url.searchParams.get("status")).toBe("eq.a%26limit=999");
  });
});
