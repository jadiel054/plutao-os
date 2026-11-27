import { describe, expect, it } from "vitest";
import {
  alternativesForTool,
  classifyObstacle,
  DEFAULT_RECOVERY_POLICY,
  planRecovery,
  runWithRecovery,
  validateResult,
  type RecoveryStep,
} from "../obstacle-recovery";
import type { AlternativeCandidate } from "../obstacle-recovery";

describe("classifyObstacle", () => {
  it("classifica falhas comuns", () => {
    expect(classifyObstacle("HTTP 403 forbidden").kind).toBe("PERMISSION_DENIED");
    expect(classifyObstacle("404 not found").kind).toBe("NOT_FOUND");
    expect(classifyObstacle("429 rate limit exceeded").kind).toBe("RATE_LIMITED");
    expect(classifyObstacle("UNKNOWN_TOOL: foo").kind).toBe("TOOL_UNAVAILABLE");
    expect(classifyObstacle("timeout after 30s").kind).toBe("TIMEOUT");
    expect(classifyObstacle("ECONNRESET na rede").kind).toBe("TRANSIENT");
    expect(classifyObstacle("").kind).toBe("UNKNOWN");
  });
});

describe("planRecovery", () => {
  const goal = "obter logs do workflow";
  const alts: AlternativeCandidate[] = [
    { id: "github.actions_list", subject: "github.actions_list", mode: "read", instruction: "listar runs" },
    { id: "github.prs.get", subject: "github.prs.get", mode: "read", instruction: "ler PR" },
    { id: "github.push_files", subject: "github.push_files", mode: "write", instruction: "commit" },
  ];

  it("ordena alternativas de leitura e nunca propõe escrita sem política", () => {
    const plan = planRecovery({
      goal,
      failedMethod: "github.actions_list",
      obstacle: classifyObstacle("500 unavailable"),
      alternatives: alts,
      policy: DEFAULT_RECOVERY_POLICY,
    });
    expect(plan.feasible).toBe(true);
    expect(plan.needsHuman).toBe(false);
    expect(plan.steps.every((s) => s.kind !== "alternative_capability" || !s.capabilityId?.includes("push_files"))).toBe(true);
    expect(plan.steps.some((s) => s.capabilityId === "github.prs.get")).toBe(true);
  });

  it("exclui métodos que já falharam", () => {
    const plan = planRecovery({
      goal,
      failedMethod: "github.actions_list",
      obstacle: classifyObstacle("500"),
      alternatives: alts,
      policy: DEFAULT_RECOVERY_POLICY,
      knownFailed: ["github.prs.get"],
    });
    expect(plan.steps.some((s) => s.capabilityId === "github.prs.get")).toBe(false);
  });

  it("escala para humano quando não há alternativa autorizada", () => {
    const plan = planRecovery({
      goal,
      failedMethod: "github.actions_list",
      obstacle: classifyObstacle("403 forbidden"),
      alternatives: [],
      policy: DEFAULT_RECOVERY_POLICY,
    });
    expect(plan.needsHuman).toBe(true);
    expect(plan.steps[0].kind).toBe("human_intervention");
    expect(plan.steps[0].instruction).toContain("Não invente resultados");
  });

  it("escrita alternativa exige aprovação humana", () => {
    const plan = planRecovery({
      goal,
      failedMethod: "github.actions_list",
      obstacle: classifyObstacle("500"),
      alternatives: [alts[2]],
      policy: { ...DEFAULT_RECOVERY_POLICY, allowWriteAlternatives: true },
    });
    expect(plan.steps[0].requiresHumanApproval).toBe(true);
  });
});

describe("runWithRecovery", () => {
  const step = (instruction: string): RecoveryStep => ({
    kind: "alternative_capability",
    capabilityId: instruction,
    instruction,
  });

  it("valida resultado real, não apenas ausência de erro", () => {
    expect(validateResult({ step: step("a"), ok: true, output: "logs: xyz" }, { outputIncludes: "logs" })).toBe(true);
    expect(validateResult({ step: step("a"), ok: true, output: "nada" }, { outputIncludes: "logs" })).toBe(false);
  });

  it("continua até obter resultado validado e registra experiências", async () => {
    const calls: string[] = [];
    const exps: Array<{ methodId: string; ok: boolean }> = [];
    const result = await runWithRecovery(
      {
        feasible: true,
        needsHuman: false,
        rationale: "",
        steps: [step("github.prs.get"), step("github.code.search")],
      },
      { outputIncludes: "logs" },
      async (s) => {
        calls.push(s.instruction);
        return s.instruction === "github.code.search"
          ? { step: s, ok: true, output: "logs encontrados" }
          : { step: s, ok: true, output: "vazio" };
      },
      async (e) => {
        exps.push(e);
      }
    );
    expect(result.resolved).toBe(true);
    expect(calls).toEqual(["github.prs.get", "github.code.search"]);
    expect(exps.length).toBe(2);
    expect(exps[0].ok).toBe(false);
    expect(exps[1].ok).toBe(true);
  });
});

describe("alternativesForTool", () => {
  it("propõe alternativas do mesmo provedor com ambiente correto", () => {
    const alts = alternativesForTool({
      tool: "computer",
      error: "browser crashed",
      goal: "verificar UI",
      enabledCapabilityIds: ["github.prs.get", "playwright.browser_execute"],
    });
    expect(alts.map((a) => a.subject)).toEqual(["playwright.browser_execute"]);
    expect(alts[0].environment).toBe("browser");
  });
});
