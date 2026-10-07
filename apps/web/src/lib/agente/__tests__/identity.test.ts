/**
 * Identidade do agente — o perfil configurado pelo usuário precisa ter efeito real
 * no system prompt, e o default não pode regredir o texto histórico (`NIX_IDENTITY`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const selectResult: { rows: unknown[] } = { rows: [] };

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResult.rows,
        }),
      }),
    }),
  }),
}));

import { NIX_IDENTITY, OPERATOR_GOLDEN_RULE } from "../operating-principles";
import {
  DEFAULT_AGENT_IDENTITY,
  DEFAULT_AGENT_NAME,
  buildIdentityBlock,
  buildIdentityLine,
  loadAgentIdentity,
} from "../identity";

describe("identidade do agente", () => {
  beforeEach(() => {
    selectResult.rows = [];
  });

  it("perfil default reproduz exatamente NIX_IDENTITY (sem regressão de prompt)", async () => {
    const profile = await loadAgentIdentity("u1");
    expect(profile.name).toBe(DEFAULT_AGENT_NAME);
    expect(profile.identity).toBe(DEFAULT_AGENT_IDENTITY);
    expect(profile.isDefault).toBe(true);
    expect(buildIdentityLine(profile)).toBe(NIX_IDENTITY);
    expect(buildIdentityBlock(profile)).toBe(NIX_IDENTITY);
  });

  it("identidade configurada pelo usuário chega ao prompt", async () => {
    selectResult.rows = [
      { name: "Athena", identity: "a estrategista do time", personality: null },
    ];

    const profile = await loadAgentIdentity("u1");
    expect(profile.isDefault).toBe(false);
    expect(buildIdentityLine(profile)).toBe("Você é Athena, a estrategista do time.");
  });

  it("personalidade configurada é injetada em bloco próprio", async () => {
    selectResult.rows = [
      {
        name: "Athena",
        identity: "a estrategista do time",
        personality: "Direta, sem rodeios, sempre com números.",
      },
    ];

    const block = buildIdentityBlock(await loadAgentIdentity("u1"));
    expect(block).toContain("Você é Athena, a estrategista do time.");
    expect(block).toContain("PERSONALIDADE (definida pelo usuário):");
    expect(block).toContain("Direta, sem rodeios, sempre com números.");
  });

  it("campos vazios ou só espaços caem no default", async () => {
    selectResult.rows = [{ name: "   ", identity: "", personality: "  " }];
    const profile = await loadAgentIdentity("u1");
    expect(profile.name).toBe(DEFAULT_AGENT_NAME);
    expect(profile.identity).toBe(DEFAULT_AGENT_IDENTITY);
    expect(profile.personality).toBeNull();
    expect(profile.isDefault).toBe(true);
  });

  it("falha de banco não quebra o runtime (fallback silencioso)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      getDb: () => {
        throw new Error("Neon Database Connection Error");
      },
    }));

    const mod = await import("../identity");
    const profile = await mod.loadAgentIdentity("u1");
    expect(profile.isDefault).toBe(true);
    expect(mod.buildIdentityLine(profile)).toBe(NIX_IDENTITY);
    spy.mockRestore();
  });

  it("a regra de ouro do operador existe e cobre verificação pós-escrita", () => {
    expect(OPERATOR_GOLDEN_RULE).toContain("REGRA DE OURO DO OPERADOR MINUCIOSO");
    expect(OPERATOR_GOLDEN_RULE).toContain("nunca declare 'pronto' sem verificação");
  });
});
