/**
 * COMPUTADOR DO PLUTÃO — plano de controle da "máquina" da conversa.
 *
 * Não é um desktop remoto: é o plano de controle da sessão — o sandbox de
 * arquivos namespaceado por usuário+conversa (filesystem/process no namespace
 * `userId__conversationId`) combinado ao stream durável de eventos
 * (`conversation_events`, append-only, seq monotônico por conversa).
 *
 * CONTROLE COMPARTILHADO (agente × humano) — NÃO é estado em memória:
 *  - O controlador atual é o ÚLTIMO evento `state_update` com source
 *    "computer" e payload.computer === true — gravado via appendConversationEvent
 *    (Neon), então TODAS as instâncias serverless enxergam o mesmo controle.
 *    Última escrita vence (seq monotônico, UNIQUE por conversa+seq).
 *  - Takeover humano expira por TTL (emitido no payload `at`); após o TTL o
 *    controle volta ao agente automaticamente em qualquer instância.
 *  - Sem migration: usa a tabela conversation_events existente (type é text
 *    livre; source="computer" particiona os eventos do computador).
 *
 * Ações humanas na máquina só existem sob controle humano e passam pelos
 * MESMOS guards das tools do build flow (sandbox, allowlist, sem rede).
 *
 * Limitação documentada (não vendida como concluído): o controle remoto real
 * de mouse/teclado sobre um navegador Chromium exige worker dedicado —
 * arquitetura em docs/COMPUTADOR_DO_PLUTAO.md. O que existe aqui (real):
 * pausa/exclusividade do agente, terminal allowlistado, editor de arquivos
 * do sandbox e preview interativo do app construído.
 */

import { and, desc, eq } from "drizzle-orm";
import { conversationEvents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { appendConversationEvent } from "@/lib/events/appendConversationEvent";

export type ComputerController = "agent" | "human";

export type ComputerState =
  | "initializing"
  | "working"
  | "human_control"
  | "waiting_human"
  | "completed"
  | "error"
  | "idle";

export const COMPUTER_CONTROL_TTL_MS = 30 * 60 * 1000;

/** Evento bruto mínimo para decidir o controlador — derivável de DB, SSE ou teste. */
export type ComputerControlEvent = {
  type: string;
  source: string;
  payload: Record<string, unknown>;
  createdAt?: Date | string | null;
};

/**
 * PURA — o controlador é decidido pelo ÚLTIMO evento do computador válida:
 *  - payload.computer === true e controller reconhecido;
 *  - TTL só se aplica a `human` (agente é sempre o default seguro);
 *  - eventos de outros emitters não sobrepõem o estado do computador.
 */
export function readControlFromEvents(
  events: ComputerControlEvent[],
  now: number = Date.now()
): ComputerController {
  for (let i = (events ?? []).length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.source !== "computer" || e.type !== "state_update") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    if (payload.computer !== true) continue;
    const controller = payload.controller;
    if (controller !== "human" && controller !== "agent") continue;
    if (controller === "human") {
      const at =
        typeof payload.at === "number"
          ? payload.at
          : e.createdAt
            ? new Date(e.createdAt).getTime()
            : Number.NaN;
      if (Number.isFinite(at) && now - at > COMPUTER_CONTROL_TTL_MS) return "agent";
    }
    return controller;
  }
  return "agent";
}

function toControlEvent(row: {
  type: string;
  source: string;
  payload: unknown;
  createdAt?: Date | string | null;
}): ComputerControlEvent {
  return {
    type: row.type,
    source: row.source,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt != null
          ? String(row.createdAt)
          : null,
  };
}

/**
 * Leitura COMPARTILHADA do controle direto do log durável — qualquer instância
 * serverless chega ao mesmo resultado (não há estado local autoritativo).
 * Em falha de leitura devolve "agent" (default seguro) — takeover/gravação
 * continuam funcionando; nenhuma sessão fica travada.
 */
export async function getComputerController(
  conversationId: string | null | undefined
): Promise<ComputerController> {
  if (!conversationId) return "agent";
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversationEvents)
      .where(
        and(
          eq(conversationEvents.conversationId, conversationId),
          eq(conversationEvents.source, "computer")
        )
      )
      .orderBy(desc(conversationEvents.seq))
      .limit(10);
    // A consulta busca os 10 mais recentes (desc); readControlFromEvents
    // espera ordem ASC (mesmo contrato de listConversationEvents).
    return readControlFromEvents(rows.map(toControlEvent).reverse(), Date.now());
  } catch {
    return "agent";
  }
}

/**
 * Única fonte de escrita do estado da máquina: evento append-only.
 * Concorrência entre instâncias: seq monotônico + UNIQUE garante que a última
 * gravação vence; leitores veem a mesma ordem em qualquer instância.
 */
export async function emitComputerState(
  conversationId: string,
  state: ComputerState,
  detail?: string
): Promise<void> {
  try {
    const controller = await getComputerController(conversationId);
    await appendConversationEvent({
      conversationId,
      type: "state_update",
      source: "computer",
      preview: `computador: ${state}${detail ? ` — ${detail}` : ""}`,
      payload: {
        computer: true,
        state,
        detail: detail ?? null,
        controller,
        at: Date.now(),
      },
    });
  } catch {
    /* event log é best-effort: a conversa não pode quebrar por evento */
  }
}

export async function takeComputerControl(
  conversationId: string
): Promise<ComputerController> {
  await appendConversationEvent({
    conversationId,
    type: "state_update",
    source: "computer",
    preview: "computador: human_control — usuário assumiu (mouse e teclado dele)",
    payload: {
      computer: true,
      state: "human_control",
      controller: "human",
      at: Date.now(),
    },
  }).catch(() => null);
  return "human";
}

export async function releaseComputerControl(
  conversationId: string
): Promise<ComputerController> {
  await appendConversationEvent({
    conversationId,
    type: "state_update",
    source: "computer",
    preview: "computador: working — controle devolvido ao agente",
    payload: {
      computer: true,
      state: "working",
      controller: "agent",
      at: Date.now(),
    },
  }).catch(() => null);
  return "agent";
}

export async function isComputerActionAllowed(
  conversationId: string | null | undefined
): Promise<boolean> {
  return (await getComputerController(conversationId)) === "human";
}

/**
 * Escolhe o arquivo de tela a partir de um listing REAL do sandbox:
 * prefere index.html na raiz; depois o primeiro .html; depois o primeiro
 * arquivo — fallback honesto (lista vazia → null).
 */
export function pickScreenFile(
  entries: Array<{ name: string; type?: string | null }>
): string | null {
  const files = (entries ?? []).filter((e) => (e.type ?? "file") === "file");
  const html = files.filter((e) => /\.html?$/i.test(e.name));
  const index = html.find((e) => /^index\.html?$/i.test(e.name));
  if (index) return index.name;
  if (html.length > 0) return html[0]!.name;
  return files.length > 0 ? files[0]!.name : null;
}

/*
 * LOCK DE FLUXO DE CRIAÇÃO POR CONVERSA (anti-concorrência de requisições).
 *
 * Em-processo: impede dois build flows da MESMA conversa em paralelo na mesma
 * instância (o caso dominante — uma conversa tem um usuário ativo). Entre
 * instâncias distintas a garantia total exigiria a fila durável (runtime de
 * missões); documentado como limitação real em docs/COMPUTADOR_DO_PLUTAO.md.
 */
const runningBuilds = new Set<string>();

export function tryAcquireConversationBuild(conversationId: string): boolean {
  if (runningBuilds.has(conversationId)) return false;
  runningBuilds.add(conversationId);
  return true;
}

export function releaseConversationBuild(conversationId: string): void {
  runningBuilds.delete(conversationId);
}

export function isBuildRunning(conversationId: string): boolean {
  return runningBuilds.has(conversationId);
}
