/**
 * H9 — Guarda de drift da documentação de capacidades.
 *
 * `docs/CAPABILITIES.md` precisa refletir exatamente o registro. Se alguém
 * adicionar/alterar uma capacidade sem regenerar o doc, este teste falha no CI.
 *
 * Regenerar: `npm run docs:capabilities`
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { capabilitiesDocPath, generateCapabilitiesMarkdown } from "../registryDoc";
import { assertRegistryCoverage, getCapabilityRegistry } from "../registry";

const docPath = capabilitiesDocPath();

describe("docs/CAPABILITIES.md", () => {
  it("o registro está coerente com os manifestos", () => {
    expect(() => assertRegistryCoverage()).not.toThrow();
  });

  it("está sincronizado com o registro de capacidades", () => {
    const expected = generateCapabilitiesMarkdown();

    if (process.env.UPDATE_DOCS === "1") {
      mkdirSync(dirname(docPath), { recursive: true });
      writeFileSync(docPath, expected, "utf-8");
      return;
    }

    expect(
      existsSync(docPath),
      `docs/CAPABILITIES.md ausente. Rode: npm run docs:capabilities`
    ).toBe(true);

    const actual = readFileSync(docPath, "utf-8");
    expect(
      actual === expected,
      "docs/CAPABILITIES.md divergente do registro. Rode: npm run docs:capabilities"
    ).toBe(true);
  });

  it("documenta todas as capacidades declaradas", () => {
    const markdown = generateCapabilitiesMarkdown();
    for (const entry of getCapabilityRegistry()) {
      expect(markdown).toContain(`\`${entry.capability}\``);
    }
  });
});
