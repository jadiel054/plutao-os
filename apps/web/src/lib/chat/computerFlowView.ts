/**
 * COMPUTADOR DO PLUTAO — VIEWSTATE PURO (client-safe, zero imports).
 *
 * Partes PURAS do fluxo de intervencao humana separadas de `computerFlow.ts`
 * para que o componente React (card do chat) NAO arraste a cadeia server
 * (getDb/Neon, appendConversationEvent, runtime/tools) para o bundle client:
 * Tipos do checkpoint, normalizacao e leitura de estado a partir de eventos.
 * A persistencia das partes vive em `computerFlow.ts` (server-only).
 */

export const COMPUTER_SOURCE = "computer";

export type ComputerCheckpoint = {
  /** Objetivo original da tarefa. */
  objective: string;
  /** Etapa atual (ex.: "preencher formulário de login"). */
  currentStep: string;
  /** Ações já concluídas (resumo curto por item). */
  completedActions: string[];
  /** Próxima ação planejada — o ponto de retomada. */
  nextAction: string;
  /** URL/contexto da página no momento do checkpoint. */
  pageUrl: string | null;
  /** Estado da sessão do navegador (id durável + status conhecido). */
  browserSession: { sessionId: string | null; status: string | null };
  /** Resultado da intervenção humana (preenchido na devolução). */
  humanIntervention: { note: string | null; resolvedAt: number | null };
  updatedAt: number;
};

export type HumanInterventionRequest = {
  /** Motivo — ex.: "tela de login sem credencial autorizada". */
  reason: string;
  /** Instrução para o usuário (ex.: faça o login no navegador, não no chat). */
  instruction?: string;
  /** Checkpoint atual da tarefa (retomada sem depender de nova mensagem). */
  checkpoint: ComputerCheckpoint;
};

export type HumanInterventionState = {
  waiting: boolean;
  reason: string | null;
  instruction: string | null;
  checkpoint: ComputerCheckpoint | null;
  resolvedNote: string | null;
};

export function emptyCheckpoint(): ComputerCheckpoint {
  return {
    objective: "",
    currentStep: "",
    completedActions: [],
    nextAction: "",
    pageUrl: null,
    browserSession: { sessionId: null, status: null },
    humanIntervention: { note: null, resolvedAt: null },
    updatedAt: 0,
  };
}

export function normalizeCheckpoint(raw: unknown): ComputerCheckpoint {
  const base = emptyCheckpoint();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  return {
    objective: typeof r.objective === "string" ? r.objective : "",
    currentStep: typeof r.currentStep === "string" ? r.currentStep : "",
    completedActions: Array.isArray(r.completedActions)
      ? r.completedActions.filter((x): x is string => typeof x === "string")
      : [],
    nextAction: typeof r.nextAction === "string" ? r.nextAction : "",
    pageUrl: str(r.pageUrl),
    browserSession: {
      sessionId: str((r.browserSession as Record<string, unknown> | undefined)?.sessionId),
      status: str((r.browserSession as Record<string, unknown> | undefined)?.status),
    },
    humanIntervention: {
      note: str((r.humanIntervention as Record<string, unknown> | undefined)?.note),
      resolvedAt:
        typeof (r.humanIntervention as Record<string, unknown> | undefined)?.resolvedAt === "number"
          ? ((r.humanIntervention as Record<string, unknown>).resolvedAt as number)
          : null,
    },
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
  };
}

export type InterventionEventLike = {
  source: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt?: string | null;
};

export type InterventionView = {
  waiting: boolean;
  reason: string | null;
  instruction: string | null;
  checkpoint: ComputerCheckpoint | null;
  /** Estado do computador no ÚLTIMO evento (waiting_human/working/...). */
  state: string | null;
  /** True quando já existe resolução depois da última espera humana. */
  stale: boolean;
};

/**
 * PURA — o card de intervenção é ditado pelo ÚLTIMO evento do computador:
 * `waiting_human` com payload.intervention → botão "Assumir controle".
 * Eventos de outros emitters (work events retrô) não manda no estado.
 */
export function readInterventionStateFromEvents(
  events: InterventionEventLike[] | null | undefined,
  _now: number = Date.now()
): InterventionView {
  const empty: InterventionView = {
    waiting: false,
    reason: null,
    instruction: null,
    checkpoint: null,
    state: null,
    stale: true,
  };
  for (let i = (events ?? []).length - 1; i >= 0; i--) {
    const e = events![i]!;
    if (e.source !== COMPUTER_SOURCE || e.type !== "state_update") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    if (payload.computer !== true) continue;
    const state = typeof payload.state === "string" ? payload.state : null;
    empty.state = state;
    if (state === "waiting_human") {
      const intervention = (payload.intervention ?? null) as Record<string, unknown> | null;
      empty.waiting = true;
      empty.stale = false;
      empty.reason = typeof intervention?.reason === "string" ? intervention.reason : null;
      empty.instruction =
        typeof intervention?.instruction === "string" ? intervention.instruction : null;
      empty.checkpoint = normalizeCheckpoint(payload.checkpoint);
    }
    break;
  }
  return empty;
}

/** Monta o texto de retomada para o agente a partir do checkpoint. */
export function buildResumeDirective(
  checkpoint: ComputerCheckpoint | null,
  context: string | null
): string | null {
  if (!checkpoint || !checkpoint.objective) return null;
  const done = checkpoint.completedActions.length
    ? checkpoint.completedActions.map((a, i) => `${i + 1}. ${a}`).join("\n")
    : "nenhuma registrada";
  const parts = [
    `Retome EXATAMENTE a tarefa em andamento (checkpoint durável) — não recomece do zero.`,
    `Objetivo original: ${checkpoint.objective}`,
    `Etapa atual: ${checkpoint.currentStep || "não registrada"}`,
    `Ações concluídas:\n${done}`,
    `Próxima ação planejada: ${checkpoint.nextAction || "decidir com base no objetivo"}`,
    checkpoint.pageUrl ? `URL/contexto da página: ${checkpoint.pageUrl}` : null,
    context?.trim() ? `Resultado da intervenção humana relatado pelo usuário: ${context.trim()}` : null,
    "Não peça para o usuário repetir o que o checkpoint já registra.",
  ];
  return parts.filter(Boolean).join("\n");
}
