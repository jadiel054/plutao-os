/**
 * Derivacao do estado de atividade do agente a partir de eventos REAIS
 * de tool calls e do fluxo de streaming. Nenhuma simulacao: os estados
 * espelham exatamente o runtime existente do chat.
 */
export type ActivityToolStatus =
  | "executing" | "ok" | "error" | "GATE_PENDING"
  | "approved" | "executed" | "rejected" | "failed";

export type ActivityToolCall = {
  provider: string;
  status: ActivityToolStatus;
};

export type AgentActivity = {
  label: string;
  tone: string;
  detail?: string;
};

export function deriveAgentActivity(
  toolCalls: ActivityToolCall[],
  isStreaming: boolean,
  hasContent: boolean,
): AgentActivity | null {
  const gate = toolCalls.find((t) => t.status === "GATE_PENDING");
  if (gate) {
    return { label: "Aguardando autorização", tone: "bg-amber-400", detail: gate.provider };
  }

  const executing = toolCalls.find((t) => t.status === "executing" || t.status === "approved");
  if (executing) {
    return { label: "Usando ferramenta", tone: "bg-amber-400 animate-pulse", detail: executing.provider };
  }

  const failed = toolCalls.find((t) => t.status === "error" || t.status === "failed");
  if (failed) {
    return { label: "Falhou", tone: "bg-rose-400", detail: failed.provider };
  }

  if (isStreaming) {
    return hasContent
      ? { label: "Executando", tone: "bg-[var(--selo)] animate-pulse" }
      : { label: "Preparando", tone: "bg-[var(--selo)] animate-pulse" };
  }

  if (toolCalls.length > 0 && hasContent) {
    return { label: "Concluído", tone: "bg-emerald-400" };
  }

  return null;
}
