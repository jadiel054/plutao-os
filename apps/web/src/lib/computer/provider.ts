/**
 * COMPUTADOR DO PLUTÃO — CONTRATO INDEPENDENTE DE PROVEDOR (Fase 1).
 *
 * Unico ponto de acoplamento com executores de navegador remoto. Quem
 * implementa este contrato hoje:
 *  - "browserless": Browserless Cloud Free (Fase 2) — Chromium real via CDP.
 *  - "self-hosted": o mesmo protocolo CDP apontado para um navegador próprio
 *    (mini PC com browserless docker) — Fase 5, desabilitado sem endpoint.
 *
 * Regras obligatorias do contrato:
 *  - NUNCA expor tokens/endpoints com segredo: as informacoes de conexao
 *    autorizadas (getConnectionInfo) so contêm identificador, provedor,
 *    transportes e status. O frontend acessa a tela/input EXCLUSIVAMENTE
 *    por rotas proxys autenticadas do Plutao.
 *  - Controle agente x humano e' EXCLUSIVO e atomico; quem coordena e' o
 *    sessionManager (Fase 4) — o provedor so executa o que lhe e' pedido
 *    apos a exclusividade ser garantida.
 *  - Toda troca de provedor nao deve exigir mudanca no Chat: a troca e'
 *    configuravel por ambiente (PLUTAO_COMPUTER_PROVIDER).
 */

export type ComputerProviderKind = "browserless" | "self-hosted";

export type ComputerSessionStatus =
  | "creating"
  | "ready"
  | "reconnecting"
  | "closed"
  | "expired"
  | "error";

export type ComputerController = "agent" | "human";

export type ComputerErrorReason =
  | "PROVIDER_UNCONFIGURED"
  | "SESSION_LIMIT"
  | "QUOTA_EXHAUSTED"
  | "PROVIDER_UNAVAILABLE"
  | "SESSION_NOT_FOUND"
  | "NOT_AUTHORIZED";

export class ComputerProviderError extends Error {
  readonly reason: ComputerErrorReason;
  readonly detail?: string;

  constructor(reason: ComputerErrorReason, message: string, detail?: string) {
    super(message);
    this.name = "ComputerProviderError";
    this.reason = reason;
    this.detail = detail;
  }
}

export type ComputerMouseEvent = {
  kind: "mouse";
  type: "move" | "down" | "up" | "click";
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
  clickCount?: number;
};

export type ComputerKeyEvent = {
  kind: "key";
  type: "press" | "down" | "up";
  text: string;
};

export type ComputerScrollEvent = {
  kind: "scroll";
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
};

export type ComputerNavigationEvent = {
  kind: "navigate";
  url: string;
};

export type ComputerBrowserAction =
  | ComputerMouseEvent
  | ComputerKeyEvent
  | ComputerScrollEvent
  | ComputerNavigationEvent;

/** Frame JPEG capturado do Chromium real (CDP Screencast), base64. */
export type ComputerScreenFrame = {
  data: string;
  width: number;
  height: number;
  capturedAt: number;
};

export type ComputerSessionSnapshot = {
  sessionId: string;
  provider: ComputerProviderKind;
  status: ComputerSessionStatus;
  controller: ComputerController;
  createdAt: number;
  /** Prazo de morte da sessao (lease) — tambem reiniciado por atividade. */
  leaseExpiresAt: number;
  /** Ultima interacao real (input/screencast) — base da expiracao por inatividade. */
  lastSeenAt: number;
  /** Estimativa de unidades consumidas (1 unidade = 30s de navegador). */
  unitsUsed: number;
  error: string | null;
};

/**
 * Informacoes de conexao AUTORIZADAS para exibicao no Chat.
 * Proibido enviar token, URL com credencial, host do provedor ou CDP direto.
 */
export type ComputerConnectionInfo = {
  sessionId: string;
  provider: ComputerProviderKind;
  status: ComputerSessionStatus;
  controller: ComputerController;
  screenTransport: "sse-screencast-proxy";
  screenEndpoint: string;
  inputEndpoint: string;
};

export type CreateSessionOptions = {
  conversationId: string;
  userId: string;
  /**
   * Id durável da linha `computer_sessions` (manager chama primeiro o
   * store para o gate atômico e depois pede ao provedor QUE SESSÃO abrir;
   * re-attach de outra instância reabre com o MESMO id — no Free isto é
   * um navegador novo). Ausente: o provedor gera o seu.
   */
  sessionId?: string;
};

export type ComputerSession = {
  readonly id: string;
  readonly provider: ComputerProviderKind;
  snapshot(): ComputerSessionSnapshot;
  connectionInfo(screenEndpoint: string, inputEndpoint: string): ComputerConnectionInfo;
  /** Executa acao real de navegador (mouse/teclado/scroll/navegacao). */
  executeAction(action: ComputerBrowserAction): Promise<void>;
  /** Assina frames reais de screencast. Retorna funcao de cancelamento. */
  subscribeScreen(listener: (frame: ComputerScreenFrame) => void): () => void;
  /** Frame mais recente (replay imediato em reconexão de SSE). */
  getLastFrame(): ComputerScreenFrame | null;
  /**
   * CAS do controle agente × humano: só troca se o estado atual for `from`.
   * Exclusividade atômica — a chamada perdedora devolve false.
   */
  compareAndSetController(from: ComputerController, to: ComputerController): boolean;
  /** Tenta reconectar o navegador (no Free inicia navegador novo). */
  reconnect(): Promise<void>;
  close(): Promise<void>;
};

export type ComputerProvider = {
  readonly kind: ComputerProviderKind;
  isConfigured(): boolean;
  /** Limites REAIS do provedor — usados para TTL, cota e mensagens honestas. */
  limits(): {
    maxSessionMs: number;
    maxConcurrentSessions: number;
    monthlyBudgetUnits: number;
    notes: string[];
  };
  createSession(options: CreateSessionOptions): Promise<ComputerSession>;
};
