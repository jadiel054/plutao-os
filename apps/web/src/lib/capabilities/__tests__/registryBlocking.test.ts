/**
 * H9 — Registro de capacidades.
 *
 * Critério de aceite: capacidade com controle faltando fica BLOQUEADA.
 * O teste remove um controle de `IMPLEMENTED_CONTROLS` e prova que a capacidade
 * correspondente passa a ser recusada (e restaura no fim).
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  IMPLEMENTED_CONTROLS,
  assertRegistryCoverage,
  capabilityBlockReason,
  evaluateCapability,
  evaluateInternalTool,
  getCapabilityRegistry,
  hasAllControls,
  isInternalTool,
} from "../registry";

const REMOVED: string[] = [];
afterEach(() => {
  for (const control of REMOVED.splice(0)) {
    // @ts-expect-error — restauração do controle removido pelo teste
    IMPLEMENTED_CONTROLS.add(control);
  }
});

describe("H9 — registro de capacidades", () => {
  it("o registro está coberto pelos manifestos (sem capacidade órfã)", () => {
    expect(() => assertRegistryCoverage()).not.toThrow();
  });

  it("toda capacidade habilitada tem TODOS os controles implementados", () => {
    for (const entry of getCapabilityRegistry()) {
      if (!entry.enabled) continue;
      for (const control of entry.requiredControls) {
        expect(IMPLEMENTED_CONTROLS.has(control)).toBe(true);
      }
    }
  });

  it("escrita exige gate: toda capacidade de write declara write_gate", () => {
    const writes = getCapabilityRegistry().filter((e) => e.mode === "write" && e.enabled);
    expect(writes.length).toBeGreaterThan(0);
    for (const entry of writes) {
      expect(entry.requiredControls).toContain("write_gate");
    }
  });

  it("REMOVER um controle bloqueia a capacidade (fail-closed)", () => {
    const entry = getCapabilityRegistry().find(
      (e) => e.enabled && e.mode === "write" && e.requiredControls.includes("write_gate")
    );
    expect(entry, "deve existir capacidade de escrita habilitada").toBeTruthy();
    if (!entry) return;

    // Estado saudável: nada bloqueado por controle.
    expect(hasAllControls(entry)).toBe(true);
    expect(capabilityBlockReason(entry.provider, entry.capability)).toBeNull();

    // Remove o controle do runtime → a capacidade precisa ficar bloqueada.
    IMPLEMENTED_CONTROLS.delete("write_gate");
    REMOVED.push("write_gate");

    expect(hasAllControls(entry)).toBe(false);
    expect(capabilityBlockReason(entry.provider, entry.capability)).toBeTruthy();
    expect(evaluateCapability(entry.provider, entry.capability).allowed).toBe(false);

    // Restaura e confirma que volta a ser permitida.
    IMPLEMENTED_CONTROLS.add("write_gate");
    REMOVED.length = 0;
    expect(capabilityBlockReason(entry.provider, entry.capability)).toBeNull();
  });

  it("capacidade desconhecida é negada (capability ausente = negado)", () => {
    const decision = evaluateCapability("github", "capability-que-nao-existe");
    expect(decision.allowed).toBe(false);
    expect(capabilityBlockReason("github", "capability-que-nao-existe")).toBeTruthy();
  });

  it("provedor desconhecido é negado", () => {
    expect(evaluateCapability("provedor-inexistente", "write").allowed).toBe(false);
  });

  it("tools internas desconhecidas são negadas e conhecidas passam", () => {
    expect(isInternalTool("filesystem")).toBe(true);
    expect(evaluateInternalTool("tool-que-nao-existe").allowed).toBe(false);
  });

  it("nenhuma capacidade usa nomenclatura de 'fase'", () => {
    for (const entry of getCapabilityRegistry()) {
      expect(entry.id.toLowerCase()).not.toMatch(/phase|fase/);
    }
  });
});
