/**
 * COMPUTADOR DO PLUTÃO — sessão interativa por conversa.
 *
 * Não é um desktop remoto: é o plano de controle da "máquina" da conversa —
 * o sandbox de arquivos namespaceado por usuário+conversa (filesystem/process
 * no namespace `userId__conversationId`) combinado ao stream durável de
 * eventos (`conversation_events`, append-only, seq monotônico).
 *
 * O que é REAL e vem do runtime:
 *  - Tela: o HTML existente no sandbox é renderizado em iframe sandboxado
 *    (`/api/computer/:id/screen` lê o arquivo real da máquina).
 *  - Terminal: saída real da tool `process` (allowlist, sem shell, env limpo).
 *  - Eventos: cada passo do build flow emite action/observation/state_update
 *    em `conversation_events` — transmitidos ao vivo pelo SSE existente e
 *    retomáveis por cursor após reconexão.
 *
 * Controle exclusivo (agente × humano):
 *  - Estado em memória por conversa com TTL — quando o usuário assume,
 *    o build flow para na PRÓXIMA fronteira de passo (nunca interrompe uma
 *    tool em voo) e nada mais executa como agente até a devolução.
 *  - TTL de 30 min devolve para o agente automaticamente (sessões não ficam
 *    travadas nem máquinas rodando indefinidamente).
 *
 * Limitação documentada (não vendida como concluída): a execução de
 * desenvolvimento do Chat é em-processo. Se o processo morrer, a execução em
 * curso é perdida — mas arquivos (sandbox em disco) e eventos (DB) persistem,
 * e a conversa retoma o trabalho com base nesse estado. Execução durável e
 * retomável passo-a-passo é o runtime de missões do Cockpit.
 */

export type ComputerController = "agent" | "human";

export type ComputerState =
  | "initializing"
  | "working"
  | "human_control"
  | "waiting_human"
  | "completed"
  | "error"
  | "idle";

import { appendConversationEvent } from "@/lib/events/appendConversationEvent";

const COMPUTER_CONTROL_TTL_MS = 30 * 60 * 1000;

type ControlEntry = { controller: ComputerController; controlledAt: number };

const controlByConversation = new Map<string, ControlEntry>();

/** Remove entradas de controle expiradas. Retorna quantas foram limpas. */
export function sweepExpiredComputerControl(now: number = Date.now()): number {
  let removed = 0;
  for (const [id, entry] of controlByConversation) {
    if (now - entry.controlledAt > COMPUTER_CONTROL_TTL_MS) {
      controlByConversation.delete(id);
      removed++;
    }
  }
  return removed;
}

function sweepIfNeeded(now: number = Date.now()): void {
  if (controlByConversation.size === 0) return;
  sweepExpiredComputerControl(now);
}

/** Controlador atual da máquina da conversa. Sem registro → agente. */
export function getComputerController(
  conversationId: string | null | undefined
): ComputerController {
  if (!conversationId) return "agent";
  sweepIfNeeded();
  const entry = controlByConversation.get(conversationId);
  if (!entry) return "agent";
  if (Date.now() - entry.controlledAt > COMPUTER_CONTROL_TTL_MS) {
    controlByConversation.delete(conversationId);
    return "agent";
  }
  return entry.controller;
}

export function takeComputerControl(conversationId: string): ComputerController {
  controlByConversation.set(conversationId, {
    controller: "human",
    controlledAt: Date.now(),
  });
  return "human";
}

export function releaseComputerControl(conversationId: string): ComputerController {
  controlByConversation.set(conversationId, {
    controller: "agent",
    controlledAt: Date.now(),
  });
  return "agent";
}

/** Ações humanas na máquina só existem quando o usuário está no controle. */
export function isComputerActionAllowed(
  conversationId: string | null | undefined
): boolean {
  return getComputerController(conversationId) === "human";
}

/** Reset apenas para testes — nunca use em código de produção. */
export function resetComputerControlForTests(): void {
  controlByConversation.clear();
}

/**
 * Estado da máquina como evento REAL do runtime (state_update em
 * conversation_events). Falha silenciosa: o build flow não pode quebrar por
 * causa do event log — o mesmo contrato dos demais emitters do projeto.
 */
export async function emitComputerState(
  conversationId: string,
  state: ComputerState,
  detail?: string
): Promise<void> {
  try {
    await appendConversationEvent({
      conversationId,
      type: "state_update",
      source: "computer",
      preview: `computador: ${state}${detail ? ` — ${detail}` : ""}`,
      payload: { computer: true, state, detail: detail ?? null, controller: getComputerController(conversationId) },
    });
  } catch {
    /* event log é best-effort */
  }
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
