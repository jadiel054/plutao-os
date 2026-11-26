import { describe, expect, it } from "vitest";
import {
  greetingPeriod,
  greetingFor,
  buildQuickActions,
  continuityLine,
  type WelcomeContext,
} from "../nixWelcome";

const baseCtx: WelcomeContext = {
  missions: [{ id: "m1", objective: "Publicar landing page", status: "running" }],
  conversations: [
    { id: "c2", title: "Planejamento trimestral", updatedAt: "2026-11-20T10:00:00Z" },
    { id: "c1", title: "Ideias iniciais", updatedAt: "2026-11-10T10:00:00Z" },
  ],
  projects: [{ id: "p1", name: "Comercial" }],
};

describe("greetingPeriod", () => {
  it("classifica os periodos do dia", () => {
    expect(greetingPeriod(0)).toBe("madrugada");
    expect(greetingPeriod(4)).toBe("madrugada");
    expect(greetingPeriod(5)).toBe("manha");
    expect(greetingPeriod(11)).toBe("manha");
    expect(greetingPeriod(12)).toBe("tarde");
    expect(greetingPeriod(17)).toBe("tarde");
    expect(greetingPeriod(18)).toBe("noite");
    expect(greetingPeriod(23)).toBe("noite");
  });

  it("normaliza horas fora do range", () => {
    expect(greetingPeriod(24)).toBe("madrugada");
    expect(greetingPeriod(-1)).toBe("noite");
  });
});

describe("greetingFor", () => {
  it("usa o nome do agente em cada periodo", () => {
    expect(greetingFor(8, "Nix")).toBe("Bom dia. Eu sou Nix.");
    expect(greetingFor(2, "Nix")).toBe("Boa madrugada. Eu sou Nix.");
    expect(greetingFor(13, "Nix")).toBe("Boa tarde. Eu sou Nix.");
    expect(greetingFor(21, "Nix")).toBe("Boa noite. Eu sou Nix.");
  });
});

describe("buildQuickActions", () => {
  it("deriva acoes do contexto real, missao primeiro", () => {
    const actions = buildQuickActions(baseCtx);
    expect(actions[0].kind).toBe("mission");
    expect(actions[0].missionId).toBe("m1");
    expect(actions.some((a) => a.kind === "conversation")).toBe(true);
    expect(actions.find((a) => a.kind === "project")?.projectId).toBe("p1");
    expect(actions.some((a) => a.kind === "tasks")).toBe(true);
    expect(actions.length).toBeLessThanOrEqual(4);
  });

  it("usa a conversa mais recente como referencia", () => {
    const actions = buildQuickActions(baseCtx);
    const conv = actions.find((a) => a.kind === "conversation");
    expect(conv?.conversationId).toBe("c2");
    expect(conv?.description).toContain("Planejamento trimestral");
  });

  it("acao de retomada carrega conversationId e acao de projeto carrega projectId", () => {
    const actions = buildQuickActions(baseCtx);
    const conv = actions.find((a) => a.kind === "conversation");
    expect(conv?.conversationId).toBe("c2");
    const proj = actions.find((a) => a.kind === "project");
    expect(proj?.projectId).toBe("p1");
    const mission = actions.find((a) => a.kind === "mission");
    expect(mission?.missionId).toBe("m1");
  });

  it("sem contexto real oferece apenas acoes genericas funcionais", () => {
    const actions = buildQuickActions({ missions: [], conversations: [], projects: [] });
    expect(actions.map((a) => a.kind)).toEqual(["tasks", "overview"]);
    expect(actions.every((a) => a.prompt.length > 0)).toBe(true);
  });

  it("respeita o limite e evita duplicatas de id", () => {
    const actions = buildQuickActions(baseCtx, 2);
    expect(actions.length).toBe(2);
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("continuityLine", () => {
  it("prefere a conversa mais recente", () => {
    expect(continuityLine(baseCtx)).toContain("Planejamento trimestral");
  });

  it("usa a missao quando nao ha conversas", () => {
    const ctx: WelcomeContext = { missions: baseCtx.missions, conversations: [], projects: [] };
    expect(continuityLine(ctx)).toContain("Publicar landing page");
  });

  it("retorna null sem contexto real (nada inventado)", () => {
    expect(continuityLine({ missions: [], conversations: [], projects: [] })).toBeNull();
  });
});
