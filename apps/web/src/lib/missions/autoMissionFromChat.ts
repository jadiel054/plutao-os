/**
 * Criação de missão a partir do chat — APENAS quando o usuário pede
 * EXPLICITAMENTE uma missão operacional (ex.: "crie uma missão para auditar...").
 *
 * Criação de sistemas/sites/apps NÃO passa mais por aqui: o Chat executa a
 * criação na própria conversa (ver lib/chat/buildRunner.ts). A separação é:
 *  - Chat + pedido de criação → fluxo de desenvolvimento na conversa.
 *  - Chat + pedido explícito de missão (ou confirmação de plano de missão) →
 *    missão durável, executada pelo runtime do Cockpit.
 */
import { createMissionRecord } from "@/lib/missions/createMissionRecord";
import { enqueueMissionExecutionJob } from "@/lib/runtime/durableJobs";
import {
  buildChatAutoIdempotencyKey,
  detectExplicitMissionRequest,
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

  // Sem caminho de confirmação: respostas tipo "sim/pode seguir" no Chat
  // retomam o FLUXO DE CRIAÇÃO da conversa (buildRunner), nunca uma missão.
  if (!detectExplicitMissionRequest(userText)) return null;

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
