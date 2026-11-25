/**
 * EGRESS/SSRF FAIL-CLOSED (Parte 1.4 da 3ª auditoria).
 *
 * Se `Fetch.enable` ( instalação do guard de egress CDP) falhar, a
 * inicialização é INTERROMPIDA — nunca existe navegador vivo sem proteção.
 * O mock de playwright-core reproduz o contrato do connectOverCDP real.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createBrowserlessProvider, type BrowserlessConfig } from "../providers/browserless";
import { ComputerProviderError } from "../provider";

const state = vi.hoisted(() => ({
  failFetchEnable: false,
  calls: [] as string[],
  closes: 0,
}));

vi.mock("playwright-core", () => {
  const cdp = {
    send: async (method: string) => {
      state.calls.push(method);
      if (method === "Fetch.enable" && state.failFetchEnable) {
        throw new Error("Fetch.enable: not supported");
      }
      return {};
    },
    on: () => undefined,
    detach: async () => undefined,
    __sends: state.calls,
  };
  const page = {
    url: () => "about:blank",
    title: async () => "pg",
    close: async () => undefined,
  };
  const context = {
    pages: () => [page],
    newPage: async () => page,
    newCDPSession: async () => cdp,
  };
  const browser = {
    contexts: () => [context],
    newContext: async () => context,
    on: () => undefined,
    close: async () => {
      state.closes += 1;
    },
  };
  return {
    chromium: {
      connectOverCDP: async () => browser,
    },
  };
});

const config: BrowserlessConfig = {
  token: "test-token",
  endpoint: "wss://production-sfo.browserless.io/chromium",
  maxSessionMs: 110_000,
  monthlyBudgetUnits: 1000,
};

describe("Fail-closed do egress guard (Fetch.enable)", () => {
  beforeEach(() => {
    state.failFetchEnable = false;
    state.calls = [];
    state.closes = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Fetch.enable falha → inicialização ABORTA com erro e a conexão parcial é destruída (teardown)", async () => {
    state.failFetchEnable = true;
    const provider = createBrowserlessProvider(config);
    await expect(
      provider.createSession({ conversationId: "conv-1", userId: "user-1" })
    ).rejects.toBeInstanceOf(ComputerProviderError);
    // Teardown real: browser.close foi chamado — nada fica conectado desprotegido.
    expect(state.closes).toBe(1);
    // Nunca começou screencast (navegador nunca ficou "pronto" sem guard).
    expect(state.calls).not.toContain("Page.startScreencast");
  });

  it("Fetch.enable OK → sessão abre e guarda o egress ativo (screencast inicializado)", async () => {
    const provider = createBrowserlessProvider(config);
    const session = await provider.createSession({ conversationId: "conv-1", userId: "user-1" });
    expect(session.snapshot().status).toBe("ready");
    expect(state.calls).toContain("Fetch.enable");
    expect(state.calls).toContain("Page.startScreencast");
    expect(state.closes).toBe(0);
    await session.close();
  });
});
