/**
 * Model Step - Execução de passo do modelo com integração híbrida (Online/Offline)
 *
 * Implementa:
 * - Chamada ao modelo (Groq ou Local)
 * - Persistência de checkpoints no banco de dados
 * - Integração com LocalProvider para modo offline
 * - Tool dispatch automático
 *
 * Proveniência em evidence: sempre `model:plutao-primary` (decisão de produto —
 * mesmo espírito do system_status MCP). Provider/model reais ficam só no checkpoint
 * interno (lastModel) para recuperação operacional, não na trilha visível.
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { agents, executions, missions, tasks, users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { saveCheckpoint } from "@/lib/runtime/checkpoint";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";
import { dispatchTool } from "@/lib/runtime/tools/dispatcher";
import { ModelProviderFactory, setModelProviderMode } from "./provider";
import { resolveCloudModelConfig } from "./resolveConfig";
import { buildSystemPrompt } from "./missionPrompt";
import { callModelWithRetry } from "./modelCall";
import { ModelCallError } from "./client";
import { loadConnectorRuntime } from "@/lib/chat/connectorRuntime";
import type { ModelConfig } from "./types";
import type { ModelMessage, ModelStepResult } from "./types";
import type { ModelMode } from "@plutao/domain";

/** Label neutro gravado em evidence.source (não vaza provider/model). */
const EVIDENCE_MODEL_SOURCE = "model:plutao-primary";

type CheckpointShape = {
  step?: string;
  stepIndex?: number;
  taskId?: string | null;
  note?: string;
  evidenceId?: string;
  completedTaskIds?: string[];
  toolCalls?: string[];
  lastModel?: { provider: string; model: string; evidenceId: string };
  modelMode?: ModelMode;
  localModelId?: string;
  localModelStatus?: "idle" | "loading" | "loaded" | "error";
};

function asCp(raw: unknown): CheckpointShape {
  if (raw && typeof raw === "object") return raw as CheckpointShape;
  return {};
}

type ModelProviderLike = {
  callModel: (messages: ModelMessage[]) => Promise<ModelStepResult>;
  getProviderType: () => "groq" | "local";
  getModelId: () => string;
};

async function getModelProvider(mode: ModelMode, cloudConfig?: ModelConfig): Promise<ModelProviderLike | null> {
  try {
    const provider = await ModelProviderFactory.getProvider({ mode, cloudConfig });
    return provider as ModelProviderLike;
  } catch (error) {
    console.error("[getModelProvider]", error);
    return null;
  }
}

export async function runModelStep(
  executionId: string,
  userId: string,
  additionalMessages: ModelMessage[] = [],
  mode?: ModelMode
): Promise<
  | {
      applied: true;
      execution: unknown;
      model: ModelStepResult;
      evidence: EvidenceItem;
      toolDispatch: unknown;
      message: string;
    }
  | {
      error: string;
      hint?: string;
      detail?: string;
    }
> {
  const effectiveMode = mode || "auto";
  setModelProviderMode(effectiveMode);

  const execution = await getOwnedExecution(executionId, userId);
  if (!execution) return { error: "NOT_FOUND" as const };

  const status = execution.status as ExecutionStatus;
  if (status === "PAUSED" || status === "INTERRUPTED") {
    return { error: "NOT_RUNNING" as const, hint: "resume before model-step" };
  }
  if (!RECOVERABLE.has(status)) {
    return { error: "TERMINAL" as const };
  }

  const db = getDb();
  const missionRows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, execution.missionId), eq(missions.userId, userId)))
    .limit(1);
  const mission = missionRows[0];
  if (!mission) return { error: "NOT_FOUND" as const };

  const agentRows = await db
    .select({
      name: agents.name,
      identity: agents.identity,
      personality: agents.personality,
    })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);
  const agent = agentRows[0] ?? null;

  // BUG 1 — mesmo caminho do chat: resolve users.preferredModel → rota de
  // catálogo (resolveCloudModelConfig). Sem isso, o runtime usava o env cru
  // (MODEL_PROVIDER/MODEL_NAME) e mandava id com prefixo errado ao endpoint.
  let cloudConfig: ModelConfig | undefined;
  try {
    const userRows = await db
      .select({ preferredModel: users.preferredModel })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const preferredId = userRows[0]?.preferredModel;
    if (preferredId) {
      const resolved = resolveCloudModelConfig(preferredId);
      if (resolved.ok) {
        cloudConfig = resolved.config;
      } else {
        console.warn("[runModelStep] preferredModel sem rota/chave:", preferredId, resolved.error);
      }
    }
  } catch (e) {
    console.error("[runModelStep] falha ao resolver preferredModel:", e);
  }

  const provider = await getModelProvider(effectiveMode, cloudConfig);
  if (!provider) {
    return { error: "MODEL_PROVIDER_NOT_AVAILABLE" as const };
  }

  // BUG 2 — awareness de conectores igual ao chat: injeta o systemBlock do
  // runtime de conectores do usuário (conectados, capacidades, write gates).
  let connectorBlock = "";
  try {
    const connectorRuntime = await loadConnectorRuntime(userId);
    connectorBlock = connectorRuntime.systemBlock;
  } catch (e) {
    console.error("[runModelStep] loadConnectorRuntime falhou:", e);
  }

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.missionId, execution.missionId))
    .orderBy(asc(tasks.createdAt))
    .limit(20);

  const evidence = parseEvidence(mission.evidence).slice(-8);
  const cp = asCp(execution.checkpoint);

  const cpWithMode: CheckpointShape = {
    ...cp,
    modelMode: effectiveMode,
  };

  const userPrompt = [
    `Mission objective: ${mission.objective}`,
    mission.definitionOfDone ? `Definition of done: ${mission.definitionOfDone}` : null,
    `Execution status: ${execution.status}`,
    `Checkpoint: ${JSON.stringify(cpWithMode)}`,
    "Tasks:",
    ...taskRows.map((t) => `- [${t.status}] ${t.title} (${t.id})`),
    "Recent evidence:",
    ...evidence.map((e) => `- (${e.source}/${e.type}) ${e.content}`),
    "Propose next action.",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ModelMessage[] = [
    { role: "system", content: buildSystemPrompt(agent, connectorBlock, execution.missionId) },
    { role: "user", content: userPrompt },
    ...additionalMessages,
  ];

  let modelResult: ModelStepResult;
  let providerType: "groq" | "local";
  let modelId: string;

  try {
    const callResult = await callModelWithRetry(provider, messages, { retries: 1, backoffMs: 800 });
    modelResult = callResult.result;
    providerType = callResult.providerType;
    modelId = callResult.modelId;
  } catch (e) {
    const mce = e instanceof ModelCallError ? e : null;
    const summary = mce?.summary() ?? (e instanceof Error ? e.message : "model call failed");

    // MELHORIA: grava o PORQUÊ (status HTTP, corpo truncado, model id,
    // endpoint, latência) como evidence da missão — visível no log/UI.
    try {
      const errEvidenceId = randomUUID();
      const errItem: EvidenceItem = {
        id: errEvidenceId,
        type: "model_error",
        content: ("MODEL_CALL_FAILED: " + summary).slice(0, 600),
        source: EVIDENCE_MODEL_SOURCE,
        taskId: execution.currentTaskId,
        missionId: execution.missionId,
        executionId,
        createdAt: new Date().toISOString(),
      };
      const prevEvErr = parseEvidence(mission.evidence);
      await db
        .update(missions)
        .set({ evidence: [...prevEvErr, errItem], updatedAt: new Date() })
        .where(and(eq(missions.id, execution.missionId), eq(missions.userId, userId)));
    } catch (logErr) {
      console.error("[runModelStep] falha ao gravar evidence de erro do modelo:", logErr);
    }

    const httpStatus = mce?.httpStatus;
    const hint =
      httpStatus === 404
        ? "Model id não existe neste endpoint — confira preferredModel/MODEL_NAME versus MODEL_BASE_URL (ex.: 'openai/gpt-oss-120b' só existe na Groq, não na OpenAI)."
        : httpStatus === 401 || httpStatus === 403
          ? "Chave de API rejeitada pelo provedor — confira GROQ_API_KEY/MODEL_API_KEY."
          : httpStatus != null && httpStatus >= 500
            ? "Provedor instável — reexecute a missão em alguns minutos."
            : "Confira MODEL_API_KEY, MODEL_NAME e MODEL_BASE_URL.";

    return { error: "MODEL_CALL_FAILED" as const, detail: summary, hint };
  }

  const now = new Date();
  const evidenceId = randomUUID();
  const stepIndex = (cp.stepIndex ?? 0) + 1;

  const evidenceItem: EvidenceItem = {
    id: evidenceId,
    type: "model_step",
    content: modelResult.content || "(empty model response)",
    // Trilha visível: neutro. Não grava model:groq:… / openai/gpt-oss-…
    source: EVIDENCE_MODEL_SOURCE,
    taskId: execution.currentTaskId,
    missionId: execution.missionId,
    executionId,
    createdAt: now.toISOString(),
  };

  const prevEv = parseEvidence(mission.evidence);
  await db
    .update(missions)
    .set({ evidence: [...prevEv, evidenceItem], updatedAt: now })
    .where(and(eq(missions.id, execution.missionId), eq(missions.userId, userId)));

  const nextCp: CheckpointShape = {
    ...cp,
    step: "model_step",
    stepIndex,
    taskId: execution.currentTaskId,
    note: "model step (plutao-primary)",
    evidenceId,
    // Interno: provider/model reais para recuperação; não vai para evidence.source
    lastModel: {
      provider: providerType,
      model: modelId,
      evidenceId,
    },
    modelMode: effectiveMode,
    localModelId: providerType === "local" ? modelId : undefined,
    localModelStatus: providerType === "local" ? ("loaded" as const) : undefined,
  };

  await saveCheckpoint(executionId, userId, nextCp);

  const updatedExec = await db
    .update(executions)
    .set({
      checkpoint: nextCp,
      checkpointAt: now,
      updatedAt: now,
      status: "RUNNING",
    })
    .where(eq(executions.id, executionId))
    .returning();

  let toolDispatch: unknown = null;
  if (modelResult.toolProposal) {
    toolDispatch = await dispatchTool({
      executionId,
      userId,
      name: modelResult.toolProposal.name,
      input: modelResult.toolProposal.input,
      taskId: execution.currentTaskId,
    });

    if (toolDispatch && typeof toolDispatch === "object" && "ok" in toolDispatch) {
      const toolDispatchResult = toolDispatch as { ok: boolean; evidenceId?: string };
      const toolCp = updateCheckpointWithTool(nextCp, {
        toolName: modelResult.toolProposal.name,
        toolInput: modelResult.toolProposal.input,
        toolEvidenceId: toolDispatchResult.evidenceId,
      });

      await saveCheckpoint(executionId, userId, toolCp);
    }
  }

  return {
    applied: true as const,
    execution: updatedExec[0],
    model: modelResult,
    evidence: evidenceItem,
    toolDispatch,
    message: modelResult.toolProposal
      ? "model step + tool dispatch attempted"
      : "model step recorded",
  };
}

function updateCheckpointWithTool(
  checkpoint: CheckpointShape,
  toolInfo: {
    toolName: string;
    toolInput: string;
    toolEvidenceId?: string;
  }
): CheckpointShape {
  return {
    ...checkpoint,
    step: "tool_call",
    stepIndex: checkpoint.stepIndex ? checkpoint.stepIndex + 1 : 1,
    toolCalls: [
      ...(checkpoint.toolCalls || []),
      `${toolInfo.toolName}:${toolInfo.toolInput.substring(0, 50)}`,
    ],
    evidenceId: toolInfo.toolEvidenceId || checkpoint.evidenceId,
    note: `Tool ${toolInfo.toolName} executed`,
  };
}
