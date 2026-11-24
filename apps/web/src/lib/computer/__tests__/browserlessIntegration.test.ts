/**
 * Fase 2 — TESTE DE INTEGRAÇÃO REAL com o Browserless (plano Free).
 *
 * NÃO usa mock: conecta num Chromium REAL da nuvem via CDP e valida:
 *   - conexão real com Chromium (connectOverCDP);
 *   - CDP vivo (screencast + input dispatch);
 *   - visualização de tela real (frame JPEG recebido);
 *   - encerramento de sessão.
 *
 * Só roda se BROWSERLESS_API_TOKEN estiver presente no ambiente (CI local do
 * dono). Sem token, o suite é PULADO — o resultado é honesto: não afirmamos
 * validação real sem executar de verdade. Consome unidades do plano gratuito.
 */
import { describe, expect, it } from "vitest";
import { readBrowserlessConfig } from "../providers/browserless";
import { createBrowserlessProvider } from "../providers/browserless";

const tokenPresent = Boolean(process.env.BROWSERLESS_API_TOKEN);

const integration = it.skipIf(!tokenPresent);

describe("integração real Browserless Free (requer BROWSERLESS_API_TOKEN)", () => {
  integration("sessão real: Chromium vivo, screencast real e encerramento", async () => {
    const config = readBrowserlessConfig();
    expect(config).not.toBeNull();
    const provider = createBrowserlessProvider(config!);
    expect(provider.isConfigured()).toBe(true);

    const session = await provider.createSession({
      conversationId: "integration-conv",
      userId: "integration-user",
    });
    expect(session.snapshot().status).toBe("ready");

    const received: unknown[] = [];
    const unsubscribe = session.subscribeScreen((frame) => received.push(frame));
    await session.executeAction({ kind: "navigate", url: "https://example.com" });

    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (received.length > 0) return resolve();
        if (Date.now() - started > 20_000) return reject(new Error("nenhum frame de screencast em 20s"));
        setTimeout(tick, 200);
      };
      tick();
    });

    const frame = received[0] as { data?: string };
    expect(typeof frame.data).toBe("string");
    expect(frame.data!.length).toBeGreaterThan(500);

    await session.reconnect();
    expect(session.snapshot().status).toBe("ready");

    await session.close();
    expect(session.snapshot().status).toBe("closed");
    unsubscribe();
  }, 90_000);
});

describe("contrato do adaptador Browserless (sem rede)", () => {
  it("sem token: o provedor reporta-se não configurado (fail-closed)", () => {
    const saved = process.env.BROWSERLESS_API_TOKEN;
    delete process.env.BROWSERLESS_API_TOKEN;
    try {
      const config = readBrowserlessConfig();
      expect(config).toBeNull();
      const provider = createBrowserlessProvider({
        token: "",
        endpoint: "wss://production-sfo.browserless.io/chromium",
        maxSessionMs: 110_000,
        monthlyBudgetUnits: 1000,
      });
      expect(provider.isConfigured()).toBe(false);
      expect(provider.limits().notes.join(" ")).toContain("2 minutos");
    } finally {
      if (saved) process.env.BROWSERLESS_API_TOKEN = saved;
    }
  });
});
