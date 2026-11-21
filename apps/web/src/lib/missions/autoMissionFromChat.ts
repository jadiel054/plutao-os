/**
 * Criação automática de missão a partir do chat (sem delegar ao Cockpit).
 * O agente nunca deve pedir para o usuário criar/executar a missão: quando o
 * pedido de construção está claro, ou o usuário confirma um plano proposto,
 * o sistema cria a missão (source "chat") e enfileira a execução durável.
 */
import { createMissionRecord } from "@/lib/missions/createMissionRecord";
import { enqueueMissionExecutionJob } from "@/lib/runtime/durableJobs";
import {
  buildChatAutoIdempotencyKey,
  detectAffirmativeConfirmation,
  detectBuildIntent,
  hasNumberedPlan,
  pickObjective,
} from "./autoMissionRules";

type ChatLikeMessage = { role: string; content: string };

export type AutoMissionResult = {
  missionId: string;
  jobId: string | null;
  objective: string;
  created: boolean;
};

export async function maybeCreateAutoMission(opts: {
  userId: string;
  conversationId: string | null;
  userText: string;
  history?: ChatLikeMessage[];
  lastAssistantText?: string | null;
}): Promise<AutoMissionResult | null> {
  const userText = (opts.userText ?? "").trim();
  if (!opts.userId || !userText) return null;

  const buildRequest = detectBuildIntent(userText);
  const confirmation =
    !buildRequest &&
    detectAffirmativeConfirmation(userText) &&
    hasNumberedPlan(opts.lastAssistantText ?? "");
  if (!buildRequest && !confirmation) return null;

  const objective = pickObjective(opts.history ?? [], userText);
  const idempotencyKey = buildChatAutoIdempotencyKey(opts.conversationId ?? "noconv", objective);
  const context = userText.slice(0, 2000) || null;

  const created = await createMissionRecord(opts.userId, {
    objective,
    context,
    constraints: null,
    definitionOfDone: "Artefato solicitado entregue e verificado com evidências reais.",
    creationSource: "chat",
    conversationId: opts.conversationId,
    idempotencyKey,
  });
  if (created.deduplicated) {
    return { missionId: created.mission.id, jobId: null, objective, created: false };
  }

  const enqueued = await enqueueMissionExecutionJob({
    missionId: created.mission.id,
    userId: opts.userId,
    conversationId: opts.conversationId,
    maxIterations: 50,
    requestId: idempotencyKey,
  });

  return { missionId: created.mission.id, jobId: enqueued.job?.id ?? null, objective, created: true };
}
