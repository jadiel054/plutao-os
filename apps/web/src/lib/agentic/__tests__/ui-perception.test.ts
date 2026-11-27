import { describe, expect, it } from "vitest";
import {
  describePage,
  executeInteraction,
  findControl,
  planInteraction,
  resolveTargetControl,
  verifyInteractionExpectations,
  type InteractionExecutor,
  type StateExpectation,
} from "../ui-perception";
import type { AppSurface, SurfaceControl } from "../app-surface";

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
  it("leitura de tela usa o TEXTO REAL recebido, não apenas o tamanho", () => {
    const d = describePage("/chat", { pageId: "chat", visibleText: "Saldo: R$ 42,00 hoje" });
    expect(d?.notes.join(" ")).toContain("Saldo: R$ 42,00 hoje");
  });
});

describe("findControl", () => {
  it("localiza controle por id e por rótulo", () => {
    expect(findControl("chat", "chat.send")?.id).toBe("chat.send");
    expect(findControl("chat", "mensagem")?.id).toBe("chat.input");
  });
});

const duaToggles: AppSurface = {
  pageId: "teste",
  route: "/teste",
  purpose: "página sintética para testes",
  controls: [
    { id: "t.faturamento", label: "Faturamento automático", kind: "toggle", testId: "faturamento-toggle" },
    { id: "t.turbo", label: "Modo turbo", kind: "toggle", testId: "turbo-toggle" },
  ] as SurfaceControl[],
};

describe("resolveTargetControl (resolução segura de controles)", () => {
  it("menciona um controle específico → somente ele é o alvo", () => {
    const r = resolveTargetControl(duaToggles, "ative o modo turbo");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.control.id).toBe("t.turbo");
  });
  it("menção a mais de um controle é ambígua e recusa", () => {
    const r = resolveTargetControl(duaToggles, "ative o faturamento e o turbo");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("ambíguos");
  });
  it("sem menção e múltiplos candidatos recusa pedindo esclarecimento", () => {
    const r = resolveTargetControl(duaToggles, "ative");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("especifique");
  });
  it("sem menção e um único candidato aceita", () => {
    const single: AppSurface = { ...duaToggles, controls: [duaToggles.controls[0]] };
    const r = resolveTargetControl(single, "ative");
    expect(r.ok).toBe(true);
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
  it("SOMENTE o controle pretendido é alterado; os demais ficam intactos", () => {
    const plan = planInteraction("configuracoes", "ative as notificações push");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].action.type).toBe("toggle");
    if (plan.steps[0].action.type !== "toggle") throw new Error("tipo inesperado");
    expect(plan.steps[0].action.control).toBe("config.notifications");
    expect(plan.steps.map((s) => (s.action.type === "toggle" ? s.action.control : ""))).not.toContain("config.autonomy");
  });
  it("objetivo ambíguo entre controles é recusado sem executar nada", () => {
    const plan = planInteraction("configuracoes", "ative");
    expect(plan.steps).toHaveLength(0);
    expect(plan.refused).toContain("especifique");
  });
  it("recusa objetivo não mapeado", () => {
    expect(planInteraction("chat", "delete tudo")?.refused).toBeTruthy();
  });
  it("digitação: extrai texto após com e mira campo de entrada", () => {
    const plan = planInteraction("chat", "escreva no campo de busca com \"plutão\"");
    const step = plan.steps[0];
    expect(step.action.type).toBe("type");
    if (step.action.type !== "type") throw new Error("tipo inesperado");
    expect(step.action.text).toBe("plutão");
    expect(step.action.control).toBe("chat.input");
  });
  it("digitação PRESERVA maiúsculas, minúsculas e o texto original", () => {
    const plan = planInteraction("chat", "escreva com \"Plutão OS v2, API-Key=AbC123\"");
    const step = plan.steps[0];
    if (step.action.type !== "type") throw new Error("tipo inesperado");
    expect(step.action.text).toBe("Plutão OS v2, API-Key=AbC123");
  });
  it("digitação sem texto especificado é RECUSADA (não limpa o campo)", () => {
    const plan = planInteraction("chat", "escreva no campo de busca");
    expect(plan.steps).toHaveLength(0);
    expect(plan.refused).toContain("não especificado");
  });
  it("digitação com texto vazio (aspas vazias) é RECUSADA", () => {
    const plan = planInteraction("chat", 'escreva com ""');
    expect(plan.steps).toHaveLength(0);
    expect(plan.refused).toBeTruthy();
  });
  it("seleção de select: controle e valor exato da opção", () => {
    const plan = planInteraction("modelos", 'selecione o modelo com "gemini"');
    const step = plan.steps[0];
    expect(step.action.type).toBe("select");
    if (step.action.type !== "select") throw new Error("tipo inesperado");
    expect(step.action.control).toBe("modelos.select");
    expect(step.action.value).toBe("gemini");
    expect(step.verify?.expect).toBe("gemini");
  });
  it("seleção sem valor especificado é recusada", () => {
    const plan = planInteraction("modelos", "selecione o modelo");
    expect(plan.steps).toHaveLength(0);
    expect(plan.refused).toContain("valor da opção");
  });
  it("seleção em página sem select é recusada", () => {
    const plan = planInteraction("planos", 'selecione com "x"');
    expect(plan.steps).toHaveLength(0);
    expect(plan.refused).toBeTruthy();
  });
  it("navega para a superfície de ajuda", () => {
    const plan = planInteraction("chat", "abra a ajuda");
    expect(plan.steps[0].action).toEqual({ type: "navigate", route: "/ajuda" });
  });
});

describe("verifyInteractionExpectations (verificação real pós-ação)", () => {
  it("sucesso confirmado quando o estado observado é igual ao esperado", () => {
    const exps: StateExpectation[] = [{ id: "turbo-toggle", expect: true }];
    const r = verifyInteractionExpectations(exps, [{ id: "turbo-toggle", state: true }]);
    expect(r.ok).toBe(true);
  });
  it("estado divergente NÃO confirma sucesso", () => {
    const exps: StateExpectation[] = [{ id: "turbo-toggle", expect: true }];
    const r = verifyInteractionExpectations(exps, [{ id: "turbo-toggle", state: false }]);
    expect(r.ok).toBe(false);
    expect(r.mismatches[0]).toContain("turbo-toggle");
  });
  it("falha de verificação (estado ausente) é reportada como não verificável", () => {
    const exps: StateExpectation[] = [{ id: "turbo-toggle", expect: true }];
    const r = verifyInteractionExpectations(exps, []);
    expect(r.ok).toBe(false);
    expect(r.unverifiable).toContain("turbo-toggle");
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
  it("seleção com opção inexistente/divergente falha na verificação pós-ação", async () => {
    const plan = planInteraction("modelos", 'selecione o modelo com "gemini"');
    const strict: InteractionExecutor = {
      execute: async () => ({ ok: true, observed: "valor selecionado: outro-modelo" }),
    };
    const out = await executeInteraction("modelos", plan.steps, strict);
    expect(out.completed).toBe(false);
    expect(out.refused).toContain("verificação pós-ação falhou");
  });
});