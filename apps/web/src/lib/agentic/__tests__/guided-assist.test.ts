import { describe, expect, it } from "vitest";
import { buildGuidedPlan, diagnosePage } from "../guided-assist";

describe("buildGuidedPlan", () => {
  it("gera etapas verificáveis para objetivos mapeados", () => {
    const plan = buildGuidedPlan("quero configurar um conector do GitHub");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.pageId && s.instruction)).toBe(true);
    expect(plan.steps[0].verify).toBeTruthy();
  });
  it("recusa objetivo sem tutorial mapeado (sem inventar)", () => {
    expect(buildGuidedPlan("cozinhar macarrão").refused).toBeTruthy();
  });
});

describe("diagnosePage", () => {
  it("detecta controles esperados ausentes", () => {
    const d = diagnosePage("chat", { controls: [{ id: "chat.input" }] });
    expect(d.findings.some((f) => f.problem.includes("chat.send"))).toBe(true);
  });
  it("página íntegra não gera achados de controles", () => {
    const d = diagnosePage("chat", { controls: [{ id: "chat.input" }, { id: "chat.send" }, { id: "chat.history" }], visibleText: "Bom dia" });
    expect(d.findings).toHaveLength(0);
  });
});
