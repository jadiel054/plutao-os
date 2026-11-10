import { describe, expect, it, vi, beforeEach } from "vitest";

const sqlCalls: string[] = [];
vi.mock("@neondatabase/serverless", () => ({
  neon: () => (strings: TemplateStringsArray) => {
    sqlCalls.push(strings.join("?"));
    return Promise.resolve([]);
  },
}));

import { ensureExecutionsTable, isRuntimeDdlEnabled, resetRuntimeDdlForTests } from "../ensure";

describe("runtime DDL bootstrap gate (A-03)", () => {
  beforeEach(() => {
    sqlCalls.length = 0;
    resetRuntimeDdlForTests();
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgres://test");
  });

  it("desabilita DDL em produção sem flag explícita", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    delete (process.env as Record<string, string | undefined>).RUNTIME_DDL_BOOTSTRAP;
    expect(isRuntimeDdlEnabled()).toBe(false);
    await ensureExecutionsTable();
    expect(sqlCalls).toHaveLength(0);
  });

  it("permite DDL em produção apenas com RUNTIME_DDL_BOOTSTRAP=true", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RUNTIME_DDL_BOOTSTRAP", "true");
    expect(isRuntimeDdlEnabled()).toBe(true);
    await ensureExecutionsTable();
    expect(sqlCalls.length).toBeGreaterThan(0);
  });

  it("mantém bootstrap ativo fora de produção por padrão", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    delete (process.env as Record<string, string | undefined>).RUNTIME_DDL_BOOTSTRAP;
    expect(isRuntimeDdlEnabled()).toBe(true);
    await ensureExecutionsTable();
    expect(sqlCalls.length).toBeGreaterThan(0);
  });

  it("RUNTIME_DDL_BOOTSTRAP=false desabilita mesmo fora de produção", async () => {
    vi.stubEnv("RUNTIME_DDL_BOOTSTRAP", "false");
    expect(isRuntimeDdlEnabled()).toBe(false);
    await ensureExecutionsTable();
    expect(sqlCalls).toHaveLength(0);
  });

  it("segunda chamada é no-op (cache)", async () => {
    vi.stubEnv("RUNTIME_DDL_BOOTSTRAP", "true");
    await ensureExecutionsTable();
    const afterFirst = sqlCalls.length;
    await ensureExecutionsTable();
    expect(sqlCalls.length).toBe(afterFirst);
  });
});
