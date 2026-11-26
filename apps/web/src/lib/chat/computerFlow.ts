/**
 * COMPUTADOR DO PLUTÃO — FLUXO FUNCIONAL HUMANO × AGENTE (Parte 2 da auditoria).
 *
 * Nix é o operador principal do navegador: recebe a tarefa, opera o site
 * remoto como um usuário e, ao ficar preso (ex.: tela de login SEM
 * credencial autorizada no cofre do runtime), pede intervenção HUMANA —
 * nunca pedindo senha no chat:
 *   1. evento durável `state_update` source="computer" state="waiting_human"
 *      com CHECKPOINT da tarefa (objetivo, etapa, ações, próximo passo,
 *      URL/contexto, sessão do navegador) — o Chat mostra o botão
 *      "Assumir controle" na mensagem da intervenção;
 *   2. o usuário executa o login DIRETO no navegador isolado (mouse/teclado
 *      reais, sob CAS durable + fencing token) — nada é digitado no chat;
 *   3. "Devolver controle" abre diálogo com texto OPCIONAL de contexto;
 *      ao confirmar, persiste o resultado da intervenção no checkpoint,
 *      libera o controle de forma durável e RETOMA a tarefa:
 *      o agente continua do PRÓXIMO passo do checkpoint SEM depender de
 *      nova mensagem do usuário (estilo Manus — volta ao chat na devolução).
 *
 * DURABILIDADE: tudo em `conversation_events` (append-only, existente — sem
 * migration). Checkpoint e intervenção sobrevivem a instâncias Vercel.
 *
 * HONESTIDADE: se a sessão Browserless expirou (Free 2 min), a retomada
 * detecta o registro fechado/expirado e diz que o navegador foi PERDIDO —
 * nunca afirma retomada da MESMA sessão se abriu navegador novo.
 *
 * CREDENCIAIS: o agente só verifica EXISTÊNCIA de credencial autorizada no
 * cofre do runtime (conectores); nunca procura senhas em arquivos, logs,
 * repositórios ou variáveis; nunca registra a senha digitada pelo usuário.
 */
import { and, desc, eq } from "drizzle-orm";
import { conversationEvents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { appendConversationEvent } from "@/lib/events/appendConversationEvent";
import { emitComputerState } from "./computer";
import {
  COMPUTER_SOURCE,
  emptyCheckpoint,
  normalizeCheckpoint,
  type ComputerCheckpoint,
  type HumanInterventionRequest,
} from "./computerFlowView";

export {
  COMPUTER_SOURCE,
  normalizeCheckpoint,
  buildResumeDirective,
  readInterventionStateFromEvents,
  type ComputerCheckpoint,
  type HumanInterventionRequest,
  type HumanInterventionState,
  type InterventionEventLike,
  type InterventionView,
} from "./computerFlowView";

function eventRowToDto(row: {
  type: string;
  source: string;
  payload: unknown;
  seq: number;
  createdAt?: Date | string | null;
}): { seq: number; type: string; source: string; payload: Record<string, unknown>; createdAt: string | null } {
  return {
    seq: row.seq,
    type: row.type,
    source: row.source,
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt != null
          ? String(row.createdAt)
          : null,
  };
}

async function recentComputerEvents(
  conversationId: string,
  limit: number
): Promise<Array<ReturnType<typeof eventRowToDto>>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversationEvents)
    .where(
      and(
        eq(conversationEvents.conversationId, conversationId),
        eq(conversationEvents.source, COMPUTER_SOURCE)
      )
    )
    .orderBy(desc(conversationEvents.seq))
    .limit(limit);
  return rows.map(eventRowToDto);
}

/** Checkpoint DURÁVEL mais recente da conversa (null se não houver). */
export async function getLatestCheckpoint(conversationId: string): Promise<ComputerCheckpoint | null> {
  try {
    const events = await recentComputerEvents(conversationId, 50);
    for (const e of events) {
      if (e.payload.checkpoint && typeof e.payload.checkpoint === "object") {
        const cp = normalizeCheckpoint(e.payload.checkpoint);
        if (cp.updatedAt > 0) return cp;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checkpoint DURÁVEL (append-only): objetivo, etapa atual, ações concluídas,
 * próximo passo, URL/contexto e estado da sessão do navegador. Chamado pelo
 * agente após cada ação — a retomada usa isto SEM depender de mensagem.
 */
export async function saveComputerCheckpoint(
  conversationId: string,
  checkpoint: ComputerCheckpoint
): Promise<void> {
  await appendConversationEvent({
    conversationId,
    type: "state_update",
    source: COMPUTER_SOURCE,
    preview: `computador: checkpoint — ${checkpoint.currentStep || checkpoint.objective}`,
    payload: {
      computer: true,
      state: "working",
      detail: "checkpoint da tarefa atualizado",
      checkpoint,
    },
  });
}

/**
 * Nix pede intervenção humana: emite `waiting_human` (o botão Assumir
 * controle aparece na mensagem da intervenção) e persiste o checkpoint —
 * a retomada não depende de nova mensagem do usuário. Senha NUNCA no chat.
 */
export async function requestHumanIntervention(
  conversationId: string,
  request: HumanInterventionRequest
): Promise<void> {
  const checkpoint: ComputerCheckpoint = {
    ...normalizeCheckpoint(request.checkpoint),
    updatedAt: Date.now(),
  };
  await emitComputerState(conversationId, "waiting_human", request.reason, {
    intervention: {
      reason: request.reason,
      instruction:
        request.instruction ??
        "Faça o login (ou a ação necessária) DIRETO no navegador isolado ao assumir o controle. NUNCA cole senha e nem token no chat.",
    },
    checkpoint,
  });
}

/**
 * Devolução com contexto opcional: persiste o resultado da intervenção no
 * checkpoint (a partir dali o agente retoma), registra o evento de resolução.
 */
export async function resolveHumanIntervention(
  conversationId: string,
  note: string | null
): Promise<ComputerCheckpoint | null> {
  const previous = await getLatestCheckpoint(conversationId);
  const checkpoint: ComputerCheckpoint = previous
    ? {
        ...previous,
        humanIntervention: { note: note?.trim() ? note.trim() : null, resolvedAt: Date.now() },
        updatedAt: Date.now(),
      }
    : {
        ...emptyCheckpoint(),
        objective: "intervenção humana no navegador remoto",
        currentStep: "intervenção resolvida pelo usuário",
        humanIntervention: { note: note?.trim() ? note.trim() : null, resolvedAt: Date.now() },
        updatedAt: Date.now(),
      };
  await emitComputerState(conversationId, "working", "controle devolvido — tarefa retomada do checkpoint", {
    checkpoint,
  });
  return checkpoint;
}

/**
 * Verifica se existe credencial AUTORIZADA no cofre do runtime para o site.
 * Pergunta EXISTÊNCIA apenas — nunca lê senhas de arquivos, logs, repos ou
 * env avulsas. Sem credencial → Nix pede intervenção humana (não tenta
 * adivinhar/pedir senha no chat).
 */
export function hasAuthorizedCredentialKnownFor(
  authorizedDomains: Array<string | null | undefined> | undefined,
  pageUrl: string | null | undefined
): boolean {
  if (!pageUrl || !authorizedDomains || authorizedDomains.length === 0) return false;
  let host: string;
  try {
    const parsed = new URL(pageUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return authorizedDomains.some(
    (d) => typeof d === "string" && d.trim() && host === d.trim().toLowerCase()
  );
}

/** Evento mínimo para ler o estado da intervenção — pura e testável. */
