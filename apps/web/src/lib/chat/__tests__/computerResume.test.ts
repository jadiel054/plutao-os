/**
 * RETOMADA AUTOMÁTICA pós-devolução (Parte 2.5).
 *
 * Provas: sem checkpoint → NÃO retoma (no_checkpoint); sessão Browserless
 * expirada → aviso HONESTO de navegador novo (nunca afirma mesma sessão);
 * com modelo + checkpoint → retoma com a diretiva que carrega o contexto.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  emitComputerState: vi.fn(async () => undefined),
  runChatBuildFlow: vi.fn(),
  getModelConfig: vi.fn(),
  computeDurableView: vi.fn(),
  computeLatestCheckpoint: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw new Error("getDb não deve ser chamado no fluxo de retomada (mock)");
  },
}));

vi.mock("@/lib/runtime/model/config", () => ({
  getModelConfig: h.getModelConfig,
}));

vi.mock("@/lib/computer/sessionManager", () => ({
  computerSessions: {
    durableView: h.computeDurableView,
  },
}));

vi.mock("@/lib/chat/buildRunner", () => ({
  runChatBuildFlow: h.runChatBuildFlow,
}));

vi.mock("@/lib/chat/computerFlow", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/chat/computerFlow")>();
  return {
    ...original,
    getLatestCheckpoint: h.computeLatestCheckpoint,
  };
});

vi.mock("@/lib/chat/computer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/chat/computer")>();
  return {
    ...original,
    emitComputerState: h.emitComputerState,
  };
});

import { browserSessionNotice, resumeAfterHumanReturn, type ResumeOutcome } from "../computerResume";
import type { ComputerCheckpoint } from "../computerFlow";

const MODEL_CONFIG = { model: "test-model", provider: "test" };

function fullCheckpoint(): ComputerCheckpoint {
  return {
    objective: "comprar licen\u00e7a no portal",
    currentStep: "formul\u00e1rio de login",
    completedActions: ["navegou para https://portal.test"],
    nextAction: "seguir ap\u00f3s o login",
    pageUrl: "https://portal.test/login",
    browserSession: { sessionId: "s-1", status: "ready" },
    humanIntervention: { note: null, resolvedAt: 1 },
    updatedAt: 1,
  };
}

beforeEach(() => {
  for (const fn of [h.runChatBuildFlow, h.getModelConfig, h.computeDurableView, h.computeLatestCheckpoint]) {
    fn.mockReset();
  }
  h.emitComputerState.mockClear();
});

describe("browserSessionNotice \u2014 honestidade sobre o navegador", () => {
  it("sess\u00e3o expirada/fechada/erro \u2192 aviso EXPL\u00cdCITO de navegador NOVO", () => {
    for (const status of ["expired", "closed", "error"]) {
      const notice = browserSessionNotice(fullCheckpoint(), status);
      expect(notice).toContain("NOVO");
      expect(notice).toContain("N\u00c3O foi restaurada");
    }
  });

  it("sess\u00e3o viva ou estado neutro \u2192 sem aviso", () => {
    expect(browserSessionNotice(fullCheckpoint(), "ready")).toBeUndefined();
    expect(browserSessionNotice(fullCheckpoint(), "creating")).toBeUndefined();
    expect(browserSessionNotice(fullCheckpoint(), null)).toBeUndefined();
    expect(browserSessionNotice(null, "expired")).toBeUndefined();
  });
});

describe("resumeAfterHumanReturn", () => {
  it("sem checkpoint dur\u00e1vel \u2192 no_checkpoint (n\u00e3o inventa tarefa)", async () => {
    h.computeLatestCheckpoint.mockResolvedValue(null);
    const result: ResumeOutcome = await resumeAfterHumanReturn({
      userId: "user-1",
      conversationId: "conv-1",
      context: "qualquer coisa",
    });
    expect(result).toMatchObject({ resumed: false, reason: "no_checkpoint" });
    expect(h.emitComputerState).not.toHaveBeenCalled();
    expect(h.runChatBuildFlow).not.toHaveBeenCalled();
  });

  it("sess\u00e3o expirada \u00e9 comunicada (browserNotice) mesmo sem modelo configurado", async () => {
    h.computeLatestCheckpoint.mockResolvedValue(fullCheckpoint());
    h.computeDurableView.mockResolvedValue({ status: "expired" });
    h.getModelConfig.mockReturnValue(null);
    const result = await resumeAfterHumanReturn({
      userId: "user-1",
      conversationId: "conv-1",
      context: null,
    });
    expect(result).toMatchObject({ resumed: false, reason: "model_not_configured" });
    expect(result.browserNotice).toContain("N\u00c3O foi restaurada");
    expect(h.runChatBuildFlow).not.toHaveBeenCalled();
  });

  it("retoma o FLUXO com a diretiva dur\u00e1vel: objetivo, pr\u00f3ximo passo e contexto do usu\u00e1rio", async () => {
    h.computeLatestCheckpoint.mockResolvedValue(fullCheckpoint());
    h.computeDurableView.mockResolvedValue({ status: "ready" });
    h.getModelConfig.mockReturnValue(MODEL_CONFIG);
    h.runChatBuildFlow.mockResolvedValue({
      executed: true,
      iterations: 2,
      steps: [{ ok: true }, { ok: true, summary: "passo" }],
      files: [],
      finalText: "pronto",
      notice: "",
    });
    const result = await resumeAfterHumanReturn({
      userId: "user-1",
      conversationId: "conv-1",
      context: "login conclu\u00eddo",
    });
    expect(result).toMatchObject({ resumed: true, reason: "resumed", iterations: 2, stepsOk: 2, stepsTotal: 2 });
    const call = h.runChatBuildFlow.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.conversationId).toBe("conv-1");
    const userText = String(call.userText);
    expect(userText).toContain("comprar licen\u00e7a no portal");
    expect(userText).toContain("seguir ap\u00f3s o login");
    expect(userText).toContain("login conclu\u00eddo");
  });

  it("SEM contexto do usu\u00e1rio a retomada usa APENAS o checkpoint (n\u00e3o depende da mensagem)", async () => {
    h.computeLatestCheckpoint.mockResolvedValue(fullCheckpoint());
    h.computeDurableView.mockResolvedValue({ status: "ready" });
    h.getModelConfig.mockReturnValue(MODEL_CONFIG);
    h.runChatBuildFlow.mockResolvedValue({
      executed: true,
      iterations: 1,
      steps: [{ ok: true }],
      files: [],
      finalText: "",
      notice: "",
    });
    await resumeAfterHumanReturn({ userId: "user-1", conversationId: "conv-1", context: null });
    const userText = String((h.runChatBuildFlow.mock.calls[0]![0] as Record<string, unknown>).userText);
    expect(userText).not.toContain("Resultado da interven\u00e7\u00e3o humana");
    expect(userText).toContain("n\u00e3o recomece do zero");
  });

  it("fluxo j\u00e1 em andamento \u2192 build_already_running com aviso", async () => {
    h.computeLatestCheckpoint.mockResolvedValue(fullCheckpoint());
    h.computeDurableView.mockResolvedValue({ status: "ready" });
    h.getModelConfig.mockReturnValue(MODEL_CONFIG);
    h.runChatBuildFlow.mockResolvedValue({
      executed: false,
      reason: "build_already_running",
      notice: "j\u00e1 existe execu\u00e7\u00e3o",
    });
    const result = await resumeAfterHumanReturn({
      userId: "user-1",
      conversationId: "conv-1",
      context: null,
    });
    expect(result).toMatchObject({ resumed: false, reason: "build_already_running", detail: "j\u00e1 existe execu\u00e7\u00e3o" });
  });

  it("erro no fluxo \u2192 resume_failed com detalhe (sem engolir)", async () => {
    h.computeLatestCheckpoint.mockResolvedValue(fullCheckpoint());
    h.computeDurableView.mockResolvedValue({ status: "ready" });
    h.getModelConfig.mockReturnValue(MODEL_CONFIG);
    h.runChatBuildFlow.mockRejectedValue(new Error("modelo explodiu"));
    const result = await resumeAfterHumanReturn({
      userId: "user-1",
      conversationId: "conv-1",
      context: null,
    });
    expect(result).toMatchObject({ resumed: false, reason: "resume_failed", detail: "modelo explodiu" });
  });
});
