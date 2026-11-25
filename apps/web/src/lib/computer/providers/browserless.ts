/**
 * Fase 2 — ADAPTADOR REAL: Browserless Cloud (plano Free) via CDP.
 *
 * Conexao REAL com Chromium remoto:
 *   wss://production-sfo.browserless.io/chromium?token=...
 * via playwright-core (connectOverCDP). Tela REAL via CDP Screencast
 * (Page.startScreencast, frames JPEG) e input REAL via CDP
 * (Input.dispatchMouseEvent / dispatchKeyEvent / navigation).
 *
 * Limitacoes REAIS do plano Free (verificadas na documentacao oficial
 * docs.browserless.io, nov/2026):
 *  - Duracao maxima de sessao: 2 minutos por conexao.
 *  - Concorrencia: 2 navegadores (o Plutao usa no maximo 1).
 *  - 1.000 unidades/mes (1 unidade = 30s de navegador; ~8h no total). Sem
 *    overage: novas conexoes sao REJEITADAS (429) quando a cota acaba.
 *  - Reconectar conta como NOVA conexao e o estado do navegador NAO e'
 *    preservado no plano Free (sessoes persistentes sao de plano pago).
 *    O estado que sobrevive e' o do sandbox de arquivos da conversa.
 *  - Live URL interativo existe no Free, mas e' URL publica por portador —
 *    o Plutao NAO usa: tela e input passam pelas rotas autenticadas.
 */
import { randomUUID } from "node:crypto";
import { isForbiddenNavigateUrl } from "../urlGuard";
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core";
import {
  ComputerProviderError,
  type ComputerBrowserAction,
  type ComputerConnectionInfo,
  type ComputerController,
  type ComputerProvider,
  type ComputerScreenFrame,
  type ComputerSession,
  type ComputerSessionSnapshot,
  type ComputerSessionStatus,
  type CreateSessionOptions,
} from "../provider";

const BROWSERLESS_FREE_MAX_SESSION_MS = 2 * 60 * 1000;
const BROWSERLESS_FREE_MONTHLY_UNITS = 1000;
const UNIT_MS = 30_000;

export type BrowserlessConfig = {
  token: string;
  endpoint: string; // wss://…/chromium (sem token dependendo do fluxo)
  maxSessionMs: number;
  monthlyBudgetUnits: number;
};

export function readBrowserlessConfig(): BrowserlessConfig | null {
  const token = process.env.BROWSERLESS_API_TOKEN;
  if (!token) return null;
  const endpoint =
    process.env.BROWSERLESS_ENDPOINT?.trim() ||
    "wss://production-sfo.browserless.io/chromium";
  const maxSessionMs = Math.min(
    BROWSERLESS_FREE_MAX_SESSION_MS,
    Math.max(10_000, Number(process.env.BROWSERLESS_MAX_SESSION_MS) || BROWSERLESS_FREE_MAX_SESSION_MS)
  );
  return {
    token,
    endpoint,
    maxSessionMs,
    monthlyBudgetUnits: Math.max(
      0,
      Number(process.env.PLUTAO_COMPUTER_MONTHLY_UNITS) || BROWSERLESS_FREE_MONTHLY_UNITS
    ),
  };
}

/** Monta a WS URL efêmera em memória — NUNCA persistida nem logada. */
function cdpUrl(config: BrowserlessConfig): string {
  const suffix = config.endpoint.includes("?") ? "&" : "?";
  const timeout = Math.max(config.maxSessionMs, 10_000);
  return `${config.endpoint}${suffix}token=${encodeURIComponent(config.token)}&timeout=${timeout}`;
}

class BrowserlessSession implements ComputerSession {
  readonly id: string;
  readonly provider: ComputerSessionSnapshot["provider"] = "browserless";
  private status: ComputerSessionStatus = "creating";
  private controller: ComputerController = "agent";
  private error: string | null = null;
  private createdAt = Date.now();
  private lastSeenAt = Date.now();
  private leaseExpiresAt = Date.now();
  private closed = false;

  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private screenListeners = new Set<(frame: ComputerScreenFrame) => void>();
  private lastFrame: ComputerScreenFrame | null = null;
  constructor(
    private readonly config: BrowserlessConfig,
    readonly conversationId: string,
    readonly userId: string,
    durableId?: string
  ) {
    // Id durável (linha computer_sessions) quando o manager já fechou o
    // gate no store; re-attach de outra instância reabre o MESMO id.
    this.id = durableId ?? `cbrl-${randomUUID()}`;
  }

  async open(): Promise<void> {
    if (this.closed) throw new ComputerProviderError("SESSION_NOT_FOUND", "Sessão já encerrada.");
    try {
      this.status = "creating";
      this.browser = await chromium.connectOverCDP(cdpUrl(this.config));
      const context = this.browser.contexts()[0] ?? (await this.browser.newContext());
      this.page = context.pages()[0] ?? (await context.newPage());
      this.cdp = await context.newCDPSession(this.page);
      await this.cdp.send("Page.enable").catch(() => undefined);
      // Viewport coerente para o screencast (chamada real de CDP).
      await this.cdp
        .send("Emulation.setDeviceMetricsOverride", {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          mobile: false,
        })
        .catch(() => undefined);
      this.cdp.on("Page.screencastFrame", (params) => this.onScreencastFrame(params));
      await this.cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 60,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      });
      this.browser.on("disconnected", () => this.onDisconnected("conexão CDP perdida"));
      this.status = "ready";
      this.createdAt = Date.now();
      this.renewLease();
    } catch (error) {
      this.status = "error";
      this.error = error instanceof Error ? error.message : "falha ao conectar";
      const message = this.error ?? "";
      if (/429|rate|concurren/i.test(message)) {
        throw new ComputerProviderError(
          "QUOTA_EXHAUSTED",
          "Provedor recusou nova conexão (cota de unidades ou concorrência esgotada).",
          message
        );
      }
      throw new ComputerProviderError("PROVIDER_UNAVAILABLE", "Não foi possível conectar ao Chromium remoto.", message);
    }
  }

  private unitsUsed = 0;

  private renewLease(): void {
    const now = Date.now();
    this.lastSeenAt = now;
    this.leaseExpiresAt = Math.min(
      this.createdAt + this.config.maxSessionMs,
      now + 30_000
    );
    // Cota estimada: uma unidade por 30s de navegador real.
    this.unitsUsed = Math.ceil((now - this.createdAt) / UNIT_MS);
  }

  private onScreencastFrame(params: {
    data?: string;
    metadata?: { deviceWidth?: number; deviceHeight?: number };
    sessionId?: number;
  }): void {
    if (!params.data || this.closed) return;
    const frame: ComputerScreenFrame = {
      data: params.data,
      width: params.metadata?.deviceWidth ?? 1280,
      height: params.metadata?.deviceHeight ?? 720,
      capturedAt: Date.now(),
    };
    this.lastFrame = frame;
    this.lastSeenAt = Date.now();
    for (const listener of this.screenListeners) {
      try {
        listener(frame);
      } catch {
        /* listener do request termineu — não derruba a sessão */
      }
    }
    if (typeof params.sessionId === "number") {
      void this.cdp
        ?.send("Page.screencastFrameAck", { sessionId: params.sessionId })
        .catch(() => undefined);
    }
  }

  private onDisconnected(reason: string): void {
    if (this.closed) return;
    if (this.status !== "reconnecting") {
      this.status = "reconnecting";
      this.error = reason;
    }
  }

  snapshot(): ComputerSessionSnapshot {
    const live: ComputerSessionStatus =
      this.status === "ready" && Date.now() > this.leaseExpiresAt
        ? "expired"
        : this.status;
    return {
      sessionId: this.id,
      provider: this.provider,
      status: live,
      controller: this.controller,
      createdAt: this.createdAt,
      leaseExpiresAt: this.leaseExpiresAt,
      lastSeenAt: this.lastSeenAt,
      unitsUsed: this.unitsUsed,
      error: this.error,
    };
  }

  connectionInfo(screenEndpoint: string, inputEndpoint: string): ComputerConnectionInfo {
    const snap = this.snapshot();
    return {
      sessionId: snap.sessionId,
      provider: this.provider,
      status: snap.status,
      controller: snap.controller,
      screenTransport: "sse-screencast-proxy",
      screenEndpoint,
      inputEndpoint,
    };
  }

  /**
   * CAS exclusivo de controle. Seção síncrona do event-loop: entre a checagem
   * e a atribuição não há await — atômico nesta instância; a exclusividade
   * entre instâncias fica no sessionManager (ver Fase 4).
   */
  compareAndSetController(from: ComputerController, to: ComputerController): boolean {
    if (this.controller !== from) return false;
    this.controller = to;
    return true;
  }

  async executeAction(action: ComputerBrowserAction): Promise<void> {
    const snap = this.snapshot();
    if (this.closed || snap.status === "closed" || snap.status === "expired") {
      throw new ComputerProviderError("SESSION_NOT_FOUND", "Sessão de navegador não está ativa.");
    }
    if (snap.status === "reconnecting") {
      throw new ComputerProviderError("PROVIDER_UNAVAILABLE", "Sessão reconectando; tente novamente.");
    }
    const cdp = this.cdp;
    if (!cdp || !this.page) {
      throw new ComputerProviderError("PROVIDER_UNAVAILABLE", "Sem sessão CDP ativa.");
    }
    if (action.kind === "navigate") {
      if (isForbiddenNavigateUrl(action.url)) {
        throw new ComputerProviderError(
          "NOT_AUTHORIZED",
          "URL de navegação não permitida (endereços internos/privados são bloqueados)."
        );
      }
      await this.page.goto(action.url, { timeout: 30_000 });
      this.renewLease();
      return;
    }
    if (action.kind === "mouse") {
      const button = action.button ?? "left";
      switch (action.type) {
        case "move":
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: action.x,
            y: action.y,
            button,
            buttons: action.button ? 1 : 0,
          });
          break;
        case "down":
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: action.x,
            y: action.y,
            button,
            buttons: 1,
            clickCount: action.clickCount ?? 1,
          });
          break;
        case "up":
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: action.x,
            y: action.y,
            button,
            buttons: 0,
            clickCount: action.clickCount ?? 1,
          });
          break;
        case "click":
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: action.x,
            y: action.y,
            button,
            buttons: 1,
            clickCount: action.clickCount ?? 1,
          });
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: action.x,
            y: action.y,
            button,
            buttons: 0,
            clickCount: action.clickCount ?? 1,
          });
          break;
      }
      this.renewLease();
      return;
    }
    if (action.kind === "key") {
      if (action.text.length > 64) {
        throw new ComputerProviderError("PROVIDER_UNAVAILABLE", "Texto acima do limite.");
      }
      for (const char of action.text) {
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          text: char,
        });
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          text: char,
        });
      }
      this.renewLease();
      return;
    }
    // scroll
    await cdp
      .send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: action.x,
        y: action.y,
        deltaX: action.deltaX,
        deltaY: action.deltaY,
      })
      .catch(async () => {
        const page = this.page;
        if (page) {
          await page.evaluate(
            ([scrollX, scrollY]) => {
              window.scrollBy(scrollX ?? 0, scrollY ?? 0);
            },
            [action.deltaX, action.deltaY] as const
          );
        }
      });
    this.renewLease();
  }

  subscribeScreen(listener: (frame: ComputerScreenFrame) => void): () => void {
    this.screenListeners.add(listener);
    this.lastSeenAt = Date.now();
    return () => {
      this.screenListeners.delete(listener);
    };
  }

  /** Frame mais recente para replay imediato em reconexões de SSE. */
  getLastFrame(): ComputerScreenFrame | null {
    return this.lastFrame;
  }

  async reconnect(): Promise<void> {
    if (this.closed) throw new ComputerProviderError("SESSION_NOT_FOUND", "Sessão encerrada.");
    if (this.controller === "human") {
      throw new ComputerProviderError(
        "PROVIDER_UNAVAILABLE",
        "Reconexão bloqueada durante o controle humano — devolva o controle primeiro."
      );
    }
    this.status = "reconnecting";
    this.error = null;
    await this.teardownBrowser();
    try {
      await this.open();
      // Plano Free: navegador novo (sem estado de navegador); ttl precisa ser
      // recontado a partir da nova conexão.
      this.createdAt = Date.now();
      this.renewLease();
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  private async teardownBrowser(): Promise<void> {
    const stops = [
      () => this.cdp?.send("Page.stopScreencast").catch(() => undefined),
      () => this.cdp?.detach().catch(() => undefined),
      () => this.page?.close().catch(() => undefined),
      () => this.browser?.close().catch(() => undefined),
    ];
    for (const stop of stops) {
      try {
        await stop();
      } catch {
        /* teardown best-effort */
      }
    }
    this.cdp = null;
    this.page = null;
    this.browser = null;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.status = "closed";
    this.screenListeners.clear();
    await this.teardownBrowser();
  }
}

export function createBrowserlessProvider(config: BrowserlessConfig): ComputerProvider {
  return {
    kind: "browserless",
    isConfigured: () => Boolean(config.token),
    limits: () => ({
      maxSessionMs: config.maxSessionMs,
      maxConcurrentSessions: 1,
      monthlyBudgetUnits: config.monthlyBudgetUnits,
      notes: [
        "Plano Free: sessão máxima de 2 minutos por conexão",
        "1.000 unidades/mês (≈8h de navegador); sem overage — conexões novas são recusadas ao fim da cota",
        "Reconexão no Free abre navegador novo e NÃO preserva o estado do navegador (estado segue no sandbox da conversa)",
      ],
    }),
    createSession: ({ conversationId, userId, sessionId }: CreateSessionOptions) => {
      const session = new BrowserlessSession(config, conversationId, userId, sessionId);
      return session.open().then(() => session as ComputerSession);
    },
  };
}
