import { describe, expect, it } from "vitest";
import {
  describePage,
  executeInteraction,
  findControl,
  planInteraction,
  type InteractionExecutor,
} from "../ui-perception";

describe("describePage", () => {
  it("descreve a página com estado declarado", () => {
    const d = describePage("/chat", {
      pageId: "chat",
      controls: [{ id: "chat.history", state: "aberto" }],
      visibleText: "Bom dia. Eu sou Nix.",
    });
    expect(d?.purpose).toContain("Conversa");
    expect(d?.controls.find((c) => c.id === "chat.history")?.state).toBe("aberto");
  });
  it("retorna null para página desconhecida", () => {
    expect(describePage("/xpto")).toBeNull();
  });
});

describe("findControl", () => {
  it("localiza controle por id e por rótulo", () => {
    expect(findControl("chat", "chat.send")?.id).toBe("chat.send");
    expect(findControl("chat", "mensagem")?.id).toBe("chat.input");
  });
});

describe("planInteraction", () => {
  it("navegação semântica (sem coordenadas)", () => {
    const plan = planInteraction("chat", "Abra o cockpit");
    expect(plan.steps[0].action).toEqual({ type: "navigate", route: "/cockpit" });
  });
  it("toggle com verificação; sensível marcado", () => {
    const plan = planInteraction("configuracoes", "desative a autonomia do agente");
    expect(plan.steps[0].action.type).toBe("toggle");
    expect(plan.steps[0].sensitive).toBe(true);
  });
  it("recusa objetivo não mapeado", () => {
    expect(planInteraction("chat", "delete tudo")?.refused).toBeTruthy();
  });
  it("digitação: extrai texto após 'com' e mira campo de entrada", () => {
    const plan = planInteraction("chat", "escreva no campo de busca com \"plutão\"");
    const step = plan.steps[0];
    expect(step.action.type).toBe("type");
    if (step.action.type !== "type") throw new Error("tipo inesperado");
    expect(step.action.text).toBe("plutão");
    expect(step.action.control).toBe("chat.input");
  });
  it("navega para a superfície de ajuda", () => {
    const plan = planInteraction("chat", "abra a ajuda");
    expect(plan.steps[0].action).toEqual({ type: "navigate", route: "/ajuda" });
  });
});

describe("executeInteraction", () => {
  const executor: InteractionExecutor = {
    execute: async (step) =>
      step.action.type === "navigate"
        ? { ok: true, observed: "rota " + step.action.route + " carregada" }
        : { ok: true, observed: "estado atual" },
  };
  it("executa e verifica pós-condição", async () => {
    const plan = planInteraction("chat", "abra o cockpit");
    const out = await executeInteraction("chat", plan.steps, executor);
    expect(out.completed).toBe(true);
  });
  it("bloqueia controle sensível sem confirmação humana", async () => {
    const plan = planInteraction("configuracoes", "desative a autonomia do agente");
    const out = await executeInteraction("configuracoes", plan.steps, executor, { confirmed: false });
    expect(out.completed).toBe(false);
    expect(out.refused).toContain("sensível");
  });
});
