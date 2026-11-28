import { describe, expect, it } from "vitest";
import { formatChatBuildPlan, parseChatBuildPlan } from "../buildPlan";

describe("buildPlan (plano + aprovação inicial da criação)", () => {
  it("faz parse de JSON puro do modelo", () => {
    const plan = parseChatBuildPlan(
      '{"objective":"Site de padaria","scope":["landing page"],"deliverables":["index.html"],"steps":["escrever html"],"toolsNeeded":["filesystem"],"limitations":["sem backend"]}'
    );
    expect(plan).not.toBeNull();
    if (!plan) throw new Error("plan null");
    expect(plan.objective).toBe("Site de padaria");
    expect(plan.scope).toEqual(["landing page"]);
    expect(plan.toolsNeeded).toEqual(["filesystem"]);
  });

  it("extrai o JSON mesmo cercado de texto", () => {
    const plan = parseChatBuildPlan(
      'Aqui está o plano:\n{"objective":"App de tarefas","scope":[],"deliverables":[],"steps":[],"toolsNeeded":[],"limitations":[]}'
    );
    expect(plan?.objective).toBe("App de tarefas");
  });

  it("retorna null sem JSON, com JSON inválido ou sem objective", () => {
    expect(parseChatBuildPlan("sem json aqui")).toBeNull();
    expect(parseChatBuildPlan('{"objective":')).toBeNull();
    expect(parseChatBuildPlan('{"scope":["x"]}')).toBeNull();
  });

  it("formatChatBuildPlan inclui objetivo e aviso de aprovação", () => {
    const text = formatChatBuildPlan({
      objective: "Site de receitas",
      scope: ["3 páginas"],
      deliverables: ["index.html"],
      steps: ["escrever", "revisar"],
      toolsNeeded: ["filesystem"],
      limitations: ["sem domínio próprio"],
    });
    expect(text).toContain("Objetivo: Site de receitas");
    expect(text).toContain("- escrever");
    expect(text).toContain("aprov");
    expect(text).toContain("Nada foi executado ainda");
  });
});
