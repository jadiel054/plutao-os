/**
 * FLUXO FUNCIONAL — checkpoint durável e intervenção humana (Parte 2).
 *
 * Persistência via `conversation_events` (append-only; SEM migration). O
 * `getDb` e os emitters são mockados; a unidade sob teste é a lógica do
 * fluxo: checkpoint, pedido de intervenção, resolução com contexto opcional,
 * leitura do estado da intervenção e diretiva de retomada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const savedEvents: Array<Record<string, unknown>> = [];
  const rows: Array<Record<string, unknown>> = [];
  return { savedEvents, rows, appendConversationEvent: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(h.rows),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/events/appendConversationEvent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/events/appendConversationEvent")>();
  return {
    ...original,
    appendConversationEvent: h.appendConversationEvent,
  };
});

vi.mock("@/lib/chat/computer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/chat/computer")>();
  return {
    ...original,
    emitComputerState: vi.fn(async () => undefined),
  };
});

import { emitComputerState } from "@/lib/chat/computer";
import {
  buildResumeDirective,
  getLatestCheckpoint,
  hasAuthorizedCredentialKnownFor,
  normalizeCheckpoint,
  readInterventionStateFromEvents,
  requestHumanIntervention,
  resolveHumanIntervention,
  saveComputerCheckpoint,
  type ComputerCheckpoint,
} from "../computerFlow";

function checkpointPart(override: Partial<ComputerCheckpoint> = {}): ComputerCheckpoint {
  return {
    objective: "comprar licença no portal",
    currentStep: "abrir formulário de login",
    completedActions: ["navegou para https://portal.test"],
    nextAction: "aguardar login do usuário",
    pageUrl: "https://portal.test/login",
    browserSession: { sessionId: "s-1", status: "ready" },
    humanIntervention: { note: null, resolvedAt: null },
    updatedAt: 1,
    ...override,
  };
}

function fakeEvent(type: string, payload: Record<string, unknown>) {
  return { type, source: "computer", payload, seq: 1, createdAt: new Date().toISOString() };
}

beforeEach(() => {
  h.rows = [];
  h.savedEvents.length = 0;
  h.appendConversationEvent.mockReset();
  h.appendConversationEvent.mockImplementation(async (event: Record<string, unknown>) => {
    h.savedEvents.push(event);
  });
  vi.mocked(emitComputerState).mockClear();
  vi.mocked(emitComputerState).mockImplementation(async () => undefined);
});

describe("checkpoint durável", () => {
  it("saveComputerCheckpoint persiste state_update working com o checkpoint", async () => {
    const cp = checkpointPart();
    await saveComputerCheckpoint("conv-1", cp);
    expect(h.appendConversationEvent).toHaveBeenCalledTimes(1);
    const event = h.savedEvents[0]!;
    expect(event.type).toBe("state_update");
    expect(event.source).toBe("computer");
    const payload = event.payload as Record<string, unknown>;
    expect(payload.computer).toBe(true);
    expect(payload.state).toBe("working");
    expect((payload.checkpoint as ComputerCheckpoint).objective).toBe(cp.objective);
  });

  it("getLatestCheckpoint lê o evento mais recente com checkpoint (ignora lixo)", async () => {
    h.rows = [
      fakeEvent("state_update", { computer: true, state: "working" }),
      fakeEvent("state_update", { computer: true, checkpoint: checkpointPart({ updatedAt: 42 }) }),
    ];
    const cp = await getLatestCheckpoint("conv-1");
    expect(cp?.updatedAt).toBe(42);
    expect(cp?.objective).toBe("comprar licença no portal");

    h.rows = [fakeEvent("state_update", { computer: true, state: "working" })];
    expect(await getLatestCheckpoint("conv-1")).toBeNull();
  });

  it("normalizeCheckpoint tolera payload inválido sem lançar", () => {
    const cp = normalizeCheckpoint(null);
    expect(cp.objective).toBe("");
    expect(cp.completedActions).toEqual([]);
    const gado = normalizeCheckpoint({ objective: 5, completedActions: "nope", browserSession: "x" });
    expect(gado.objective).toBe("");
    expect(gado.completedActions).toEqual([]);
    expect(gado.browserSession.sessionId).toBeNull();
  });
});

describe("intervenção humana (waiting_human → devolução)", () => {
  it("requestHumanIntervention emite waiting_human com instrução anti-senha e checkpoint", async () => {
    await requestHumanIntervention("conv-1", {
      reason: "Tela de login detectada (https://portal.test/login)",
      checkpoint: checkpointPart(),
    });
    expect(emitComputerState).toHaveBeenCalledTimes(1);
    const [, state, detail, extra] = vi.mocked(emitComputerState).mock.calls[0]!;
    expect(state).toBe("waiting_human");
    expect(detail).toContain("login detectada");
    const intervention = (extra as Record<string, unknown>).intervention as Record<string, unknown>;
    expect(String(intervention.instruction)).toContain("NUNCA");
    expect(((extra as Record<string, unknown>).checkpoint as ComputerCheckpoint).objective).toBe(
      "comprar licença no portal"
    );
  });

  it("resolveHumanIntervention com contexto escreve o resultado no checkpoint", async () => {
    h.rows = [fakeEvent("state_update", { computer: true, checkpoint: checkpointPart() })];
    const cp = await resolveHumanIntervention("conv-1", "faz o login com minha conta — siga do dashboard");
    expect(cp?.humanIntervention.note).toBe("faz o login com minha conta — siga do dashboard");
    expect(cp?.humanIntervention.resolvedAt).toBeGreaterThan(0);
    expect(cp?.objective).toBe("comprar licença no portal");
    expect(emitComputerState).toHaveBeenCalledWith("conv-1", "working", expect.stringContaining("retomada"), expect.anything());
  });

  it("resolveHumanIntervention SEM checkpoint anterior e SEM texto ainda gera checkpoint válido", async () => {
    const cp = await resolveHumanIntervention("conv-1", "   ");
    expect(cp?.objective).toContain("intervenção humana");
    expect(cp?.humanIntervention.note).toBeNull();
    expect(cp?.updatedAt).toBeGreaterThan(0);
  });
});

describe("leitura do estado de intervenção (pura)", () => {
  it("waiting_human é o último evento → waiting true com reason/instruction/checkpoint", () => {
    const view = readInterventionStateFromEvents([
      fakeEvent("state_update", { computer: true, state: "working" }),
      fakeEvent("state_update", {
        computer: true,
        state: "waiting_human",
        intervention: { reason: "login", instruction: "assuma" },
        checkpoint: checkpointPart(),
      }),
    ]);
    expect(view.waiting).toBe(true);
    expect(view.stale).toBe(false);
    expect(view.reason).toBe("login");
    expect(view.checkpoint?.pageUrl).toBe("https://portal.test/login");
  });

  it("evento working DEPOIS do waiting_human → intervenção resolvida (stale)", () => {
    const view = readInterventionStateFromEvents([
      fakeEvent("state_update", {
        computer: true,
        state: "waiting_human",
        intervention: { reason: "login" },
        checkpoint: checkpointPart(),
      }),
      fakeEvent("state_update", { computer: true, state: "working" }),
    ]);
    expect(view.waiting).toBe(false);
    expect(view.state).toBe("working");
    expect(view.stale).toBe(true);
  });

  it("eventos de outros emitters NÃO mandam no card (não confundir cards retrô com progresso)", () => {
    const view = readInterventionStateFromEvents([
      { source: "build", type: "state_update", payload: { computer: true, state: "waiting_human" } },
      { source: "computer", type: "observation", payload: { state: "waiting_human" } },
    ]);
    expect(view.waiting).toBe(false);
    expect(view.state).toBeNull();
  });
});

describe("diretivas de retomada (checkpoint como fonte)", () => {
  it("sem checkpoint → null (sem retomada automática)", () => {
    expect(buildResumeDirective(null, "contexto")).toBeNull();
  });

  it("com checkpoint: objetivo, próximo passo e (se houver) resultado da intervenção", () => {
    const directive = buildResumeDirective(checkpointPart(), "login feito — começar no dashboard");
    expect(directive).toContain("não recomece do zero");
    expect(directive).toContain("comprar licença no portal");
    expect(directive).toContain("aguardar login do usuário");
    expect(directive).toContain("login feito — começar no dashboard");

    const withoutContext = buildResumeDirective(checkpointPart(), "   ");
    expect(withoutContext).not.toContain("Resultado da intervenção humana");
    expect(withoutContext).toContain("Próxima ação planejada");
  });
});

describe("cofre de credenciais — só EXISTÊNCIA, host exato", () => {
  it("domínio autorizado idêntico ao host da página → true", () => {
    expect(hasAuthorizedCredentialKnownFor(["portal.test"], "https://portal.test/login")).toBe(true);
  });

  it("host diferente, domínio vazio ou URL inválida → false (sem procurar senhas em lugar nenhum)", () => {
    expect(hasAuthorizedCredentialKnownFor(["outra.test"], "https://portal.test/login")).toBe(false);
    expect(hasAuthorizedCredentialKnownFor([], "https://portal.test/login")).toBe(false);
    expect(hasAuthorizedCredentialKnownFor(["portal.test"], "ftp://portal.test")).toBe(false);
    expect(hasAuthorizedCredentialKnownFor(["portal.test"], "sem url")).toBe(false);
  });
});
