import { describe, expect, it, vi } from "vitest";

const createWriteGateMock = vi.fn();
vi.mock("@/lib/connectors/gates", () => ({
  createWriteGate: (...args: unknown[]) => createWriteGateMock(...args),
}));
vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: vi.fn(),
}));

import { createChatBuildPlanGate, formatChatBuildPlan, parseChatBuildPlan } from "../buildPlan";

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

  it("createChatBuildPlanGate persiste o pedido original (userText) no payload do gate", async () => {
    createWriteGateMock.mockResolvedValue({ id: "gate-1" });
    const plan = {
      objective: "Site de receitas",
      scope: [],
      deliverables: [],
      steps: [],
      toolsNeeded: [],
      limitations: [],
    };
    await createChatBuildPlanGate({
      userId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      plan,
      userText: "crie um site de receitas",
    });
    const arg = createWriteGateMock.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(arg.payload.userText).toBe("crie um site de receitas");
    expect(arg.payload.conversationId).toBe("22222222-2222-4222-8222-222222222222");
    expect((arg.payload.plan as { objective: string }).objective).toBe("Site de receitas");
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
