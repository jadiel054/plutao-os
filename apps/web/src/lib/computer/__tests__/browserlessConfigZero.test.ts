import { afterEach, describe, expect, it } from "vitest";
import { readBrowserlessConfig } from "../providers/browserless";

/**
 * Auditoria P2 — parse de configuração: "0" explícito é valor válido e NÃO
 * pode ser reinterpretado como ausente (antes, `Number(env) || default`
 * transformava cota zero no default de 1.000 unidades).
 */
const ORIGINAL = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL)) delete process.env[key];
    else process.env[key] = ORIGINAL[key];
  }
});

describe("readBrowserlessConfig — parse de cota mensal e TTL", () => {
  it("cota explícita 0 é respeitada (não vira o default 1000)", () => {
    process.env.BROWSERLESS_API_TOKEN = "tok";
    process.env.PLUTAO_COMPUTER_MONTHLY_UNITS = "0";
    const config = readBrowserlessConfig();
    expect(config).not.toBeNull();
    expect(config?.monthlyBudgetUnits).toBe(0);
  });

  it("cota ausente usa o default do Free", () => {
    process.env.BROWSERLESS_API_TOKEN = "tok";
    delete process.env.PLUTAO_COMPUTER_MONTHLY_UNITS;
    expect(readBrowserlessConfig()?.monthlyBudgetUnits).toBe(1000);
  });

  it("string vazia é tratada como ausente (default)", () => {
    process.env.BROWSERLESS_API_TOKEN = "tok";
    process.env.PLUTAO_COMPUTER_MONTHLY_UNITS = "  ";
    expect(readBrowserlessConfig()?.monthlyBudgetUnits).toBe(1000);
  });

  it("valor inválido usa o default do Free", () => {
    process.env.BROWSERLESS_API_TOKEN = "tok";
    process.env.PLUTAO_COMPUTER_MONTHLY_UNITS = "abc";
    expect(readBrowserlessConfig()?.monthlyBudgetUnits).toBe(1000);
  });

  it("cota positiva explícita é respeitada", () => {
    process.env.BROWSERLESS_API_TOKEN = "tok";
    process.env.PLUTAO_COMPUTER_MONTHLY_UNITS = "42";
    expect(readBrowserlessConfig()?.monthlyBudgetUnits).toBe(42);
  });
});
