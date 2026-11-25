/**
 * RETOMADA AUTOMÁTICA da tarefa após a devolução do controle (Parte 2.5).
 *
 * O checkpoint durável é a fonte: mesmo SEM texto do usuário, Nix sabe qual
 * tarefa retomar e qual é o próximo passo. Honestidade obrigatória:
 *  - se a sessão Browserless expirou/foi perdida (Free 2 min), isso é
 *    DECLARADO na retomada — nunca se afirma que a MESMA sessão voltou;
 *  - sem checkpoint durável, NÃO há retomada automática (resumed=false) —
 *    sem cliente de modelo, também não (rollback para a próxima mensagem).
 */
import { getModelConfig } from "@/lib/runtime/model/config";
import { computerSessions } from "@/lib/computer/sessionManager";
import { emitComputerState } from "./computer";
import {
  buildResumeDirective,
  getLatestCheckpoint,
  type ComputerCheckpoint,
} from "./computerFlow";
import { runChatBuildFlow } from "./buildRunner";

export type ResumeOutcome = {
  resumed: boolean;
  reason:
    | "resumed"
    | "no_checkpoint"
    | "model_not_configured"
    | "build_already_running"
    | "resume_failed";
  detail?: string;
  /** Aviso honesto sobre o estado do navegador (ex.: sessão perdida no Free). */
  browserNotice?: string;
  iterations?: number;
  stepsOk?: number;
  stepsTotal?: number;
};

/** Aviso HONESTO sobre a sessão do navegador na retomada (Free). */
export function browserSessionNotice(
  checkpoint: ComputerCheckpoint | null,
  status: string | null
): string | undefined {
  if (!checkpoint) return undefined;
  const live = status === "ready" || status === "creating";
  if (!status || status === "offline") {
    return undefined;
  }
  if (status === "expired" || status === "closed" || status === "error") {
    return (
      `A sessão do navegador remoto foi perdida (${status}) — no plano Free a reconexão abre um navegador NOVO, ` +
      `então a tarefa CONTINUA mas a MESMA sessão NÃO foi restaurada. Informe essa limitação ao usuário.`
    );
  }
  if (live) return undefined;
  return `Estado do navegador na retomada: ${status}.`;
}

export async function resumeAfterHumanReturn(opts: {
  userId: string;
  conversationId: string;
  context: string | null;
}): Promise<ResumeOutcome> {
  const checkpoint = await getLatestCheckpoint(opts.conversationId).catch(() => null);
  const directive = buildResumeDirective(checkpoint, opts.context);
  if (!directive) {
    return { resumed: false, reason: "no_checkpoint" };
  }

  const view = await computerSessions.durableView(opts.conversationId, opts.userId).catch(() => null);
  const browserNotice = browserSessionNotice(checkpoint, view?.status ?? null);

  const modelConfig = getModelConfig();
  if (!modelConfig) {
    return {
      resumed: false,
      reason: "model_not_configured",
      detail: "sem cliente de modelo — a retomada acontece na próxima mensagem do usuário.",
      browserNotice,
    };
  }

  await emitComputerState(
    opts.conversationId,
    "working",
    "retomando a tarefa do checkpoint após devolução do controle"
  ).catch(() => undefined);

  try {
    const flow = await runChatBuildFlow({
      userId: opts.userId,
      conversationId: opts.conversationId,
      userText: directive,
      history: [],
      modelConfig,
      onStep: undefined,
    });
    if (!flow.executed) {
      return {
        resumed: false,
        reason: flow.reason === "build_already_running" ? "build_already_running" : "model_not_configured",
        detail: flow.reason === "build_already_running" ? flow.notice : undefined,
        browserNotice,
      };
    }
    return {
      resumed: true,
      reason: "resumed",
      browserNotice,
      iterations: flow.iterations,
      stepsOk: flow.steps.filter((s) => s.ok).length,
      stepsTotal: flow.steps.length,
    };
  } catch (error) {
    return {
      resumed: false,
      reason: "resume_failed",
      detail: error instanceof Error ? error.message : undefined,
      browserNotice,
    };
  }
}
