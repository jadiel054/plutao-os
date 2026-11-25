/**
 * TOOL "computer" — Nix opera o navegador remoto (Parte 2).
 *
 * Provas: parser com guard SSRF na borda; pausa com HUMANO no controle;
 * CONTROL_UNCONFIRMED quando o estado durável não é confirmável (nenhum
 * comando CDP); ACTION_OK gravando checkpoint; tela de login SEM credencial
 * autorizada → intervenção humana (WAITING_HUMAN_LOGIN) — nunca senha no chat.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  return {
    isHumanInControl: vi.fn(),
    durableControllerState: vi.fn(),
    ensureSession: vi.fn(),
    reserve: vi.fn(),
    executeAction: vi.fn(),
    getLatestCheckpoint: vi.fn(),
    saveComputerCheckpoint: vi.fn(),
    requestHumanIntervention: vi.fn(),
  };
});

vi.mock("../buildRunner", () => ({
  isHumanInControl: h.isHumanInControl,
}));

vi.mock("@/lib/computer/sessionManager", () => ({
  computerSessions: {
    durableControllerState: h.durableControllerState,
    ensureSession: h.ensureSession,
    reserve: h.reserve,
  },
}));

vi.mock("../computerFlow", () => ({
  getLatestCheckpoint: h.getLatestCheckpoint,
  saveComputerCheckpoint: h.saveComputerCheckpoint,
  requestHumanIntervention: h.requestHumanIntervention,
}));

import { parseAgentComputerInput, runComputerAgentStep } from "../computerAgentTool";
import type { ComputerSession } from "@/lib/computer/provider";

function fakeSession(status = "ready"): ComputerSession {
  return {
    id: "s-1",
    provider: "browserless",
    snapshot: () => ({
      sessionId: "s-1",
      provider: "browserless",
      status: status as "ready",
      controller: "agent",
      createdAt: 0,
      leaseExpiresAt: 110_000,
      lastSeenAt: 0,
      unitsUsed: 0,
      error: null,
    }),
    connectionInfo: (screenEndpoint, inputEndpoint) => ({
      sessionId: "s-1",
      provider: "browserless",
      status: status as "ready",
      controller: "agent",
      screenTransport: "sse-screencast-proxy" as const,
      screenEndpoint,
      inputEndpoint,
    }),
    compareAndSetController: () => false,
    executeAction: h.executeAction,
    subscribeScreen: () => () => undefined,
    getLastFrame: () => null,
    reconnect: async () => undefined,
    close: async () => undefined,
  } as ComputerSession;
}

const BASE = { userId: "user-1", conversationId: "conv-1" };

beforeEach(() => {
  h.isHumanInControl.mockResolvedValue(false);
  h.durableControllerState.mockResolvedValue("agent");
  h.getLatestCheckpoint.mockResolvedValue(null);
  h.saveComputerCheckpoint.mockResolvedValue(undefined);
  h.requestHumanIntervention.mockResolvedValue(undefined);
  h.executeAction.mockReset();
});

describe("parseAgentComputerInput — guard de URLs na borda (SSRF)", () => {
  it("navigate público ok e carrega objective/currentStep/nextAction", () => {
    const parsed = parseAgentComputerInput(
      JSON.stringify({ kind: "navigate", url: "https://portal.test/login", objective: "comprar", currentStep: "abrir site", nextAction: "procurar preço" })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.action).toMatchObject({ kind: "navigate", url: "https://portal.test/login" });
    expect(parsed?.objective).toBe("comprar");
    expect(parsed?.nextAction).toBe("procurar preço");
  });

  it("URLs internas/privadas/metadata são REJEITADAS:", () => {
    for (const url of [
      "http://localhost:3000/admin",
      "http://127.0.0.1/x",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.1/x",
      "file:///etc/passwd",
    ]) {
      expect(parseAgentComputerInput(JSON.stringify({ kind: "navigate", url }))).toBeNull();
    }
  });

  it("JSON inválido, dados faltando e text longo → null", () => {
    expect(parseAgentComputerInput("não é json")).toBeNull();
    expect(parseAgentComputerInput(JSON.stringify({ kind: "navigate" }))).toBeNull();
    expect(parseAgentComputerInput(JSON.stringify({ kind: "mouse" }))).toBeNull();
    expect(parseAgentComputerInput(JSON.stringify({ kind: "key", text: "x".repeat(65) }))).toBeNull();
    expect(parseAgentComputerInput(JSON.stringify({ kind: "desconhecido" }))).toBeNull();
  });
});

describe("runComputerAgentStep — pausa e fail-safe do controle", () => {
  it("sem conversa → NO_CONVERSATION", async () => {
    const result = await runComputerAgentStep({ ...BASE, conversationId: null, input: "{}" });
    expect(result).toMatchObject({ ok: false, tool: "computer", error: "NO_CONVERSATION" });
  });

  it("humano no controle → HUMAN_IN_CONTROL e NENHUM comando executado", async () => {
    h.isHumanInControl.mockResolvedValue(true);
    const result = await runComputerAgentStep({ ...BASE, input: JSON.stringify({ kind: "navigate", url: "https://portal.test" }) });
    expect(result).toMatchObject({ ok: false, error: "HUMAN_IN_CONTROL" });
    expect(h.ensureSession).not.toHaveBeenCalled();
    expect(h.executeAction).not.toHaveBeenCalled();
  });

  it("controller durável 'human' → HUMAN_IN_CONTROL (fonte durável prevalece)", async () => {
    h.durableControllerState.mockResolvedValue("human");
    const result = await runComputerAgentStep({ ...BASE, input: "{}" });
    expect(result).toMatchObject({ ok: false, error: "HUMAN_IN_CONTROL" });
    expect(h.executeAction).not.toHaveBeenCalled();
  });

  it("controller durável 'unknown' → CONTROL_UNCONFIRMED e NENHUM comando CDP enviado", async () => {
    h.durableControllerState.mockResolvedValue("unknown");
    const result = await runComputerAgentStep({ ...BASE, input: JSON.stringify({ kind: "navigate", url: "https://portal.test" }) });
    expect(result).toMatchObject({ ok: false, error: "CONTROL_UNCONFIRMED" });
    expect(h.ensureSession).not.toHaveBeenCalled();
    expect(h.executeAction).not.toHaveBeenCalled();
  });

  it("sem sessão disponível → SESSION_UNAVAILABLE com mensagem honesta", async () => {
    h.ensureSession.mockResolvedValue(null);
    h.reserve.mockResolvedValue({ ok: false, reason: "QUOTA_EXHAUSTED" });
    const result = await runComputerAgentStep({ ...BASE, input: JSON.stringify({ kind: "navigate", url: "https://portal.test" }) });
    expect(result).toMatchObject({ ok: false, error: "SESSION_UNAVAILABLE" });
  });

  it("ação ok → ACTION_OK e checkpoint salvo com objetivo/próximo passo", async () => {
    h.ensureSession.mockResolvedValue(fakeSession());
    h.executeAction.mockResolvedValue({ pageUrl: "https://portal.test/", pageTitle: "Portal", isLogin: false });
    const result = await runComputerAgentStep({
      ...BASE,
      input: JSON.stringify({ kind: "navigate", url: "https://portal.test/", objective: "comprar licença", currentStep: "abrir site", nextAction: "procurar preço" }),
    });
    expect(result).toMatchObject({ ok: true });
    expect(JSON.parse(result.ok ? result.output : "")).toMatchObject({ status: "ACTION_OK", pageUrl: "https://portal.test/" });
    expect(h.saveComputerCheckpoint).toHaveBeenCalledTimes(1);
    const cp = h.saveComputerCheckpoint.mock.calls[0]![1] as Record<string, unknown>;
    expect(cp.objective).toBe("comprar licença");
    expect(cp.nextAction).toBe("procurar preço");
    expect(cp.pageUrl).toBe("https://portal.test/");
  });

  it("tela de login SEM credencial autorizada → WAITING_HUMAN_LOGIN + pedido de intervenção (nunca senha no chat)", async () => {
    h.ensureSession.mockResolvedValue(fakeSession());
    h.executeAction.mockResolvedValue({ pageUrl: "https://portal.test/login", pageTitle: "Sign in", isLogin: true });
    const result = await runComputerAgentStep({
      ...BASE,
      input: JSON.stringify({ kind: "navigate", url: "https://portal.test/login", currentStep: "chegou ao login" }),
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.ok ? result.output : "")).toMatchObject({
      status: "WAITING_HUMAN_LOGIN",
      pageUrl: "https://portal.test/login",
    });
    expect(h.executeAction).toHaveBeenCalledTimes(1);
    expect(h.requestHumanIntervention).toHaveBeenCalledTimes(1);
    const [, request] = h.requestHumanIntervention.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(String(request.reason)).toContain("login");
    expect(String(request.instruction)).toContain("NUNCA");
    expect((request.checkpoint as Record<string, unknown>).pageUrl).toBe("https://portal.test/login");
  });
});
