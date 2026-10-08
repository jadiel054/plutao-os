/**
 * Model Step - Execução de passo do modelo com integração híbrida (Online/Offline)
 *
 * Implementa:
 * - Chamada ao modelo (remoto ou local)
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
import { executions, missions, tasks, users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { saveCheckpoint } from "@/lib/runtime/checkpoint";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";
import { dispatchTool } from "@/lib/runtime/tools/dispatcher";
import { ModelProviderFactory, setModelProviderMode } from "./provider";
import { resolveCloudModelConfig } from "./resolveConfig";
import { buildSystemPrompt } from "./missionPrompt";
import { callModelWithRetry, classifyModelError, type ModelProviderLike } from "./modelCall";
import { loadConnectorRuntime } from "@/lib/chat/connectorRuntime";
import { sanitizeText } from "@/lib/security/sanitize";
import { loadAgentIdentity } from "@/lib/agente/identity";
import { resolveSpecialistPolicy } from "@/lib/missions/specialistProfiles";
import type { ModelConfig, ModelMessage, ModelStepResult } from "./types";
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
  missionGraphRuntime?: { activeNodeId?: string | null; [key: string]: unknown };
};

function asCp(raw: unknown): CheckpointShape {
  if (raw && typeof raw === "object") return raw as CheckpointShape;
  return {};
}

async function getModelProvider(mode: ModelMode, cloudConfig?: ModelConfig): Promise<ModelProviderLike | null> {
  try {
    const provider = await ModelProviderFactory.getProvider({ mode });
    // Se cloudConfig foi resolvida e o provedor não é local, substituímos a chamada do chatCompletion criando um wrapper local
    if (cloudConfig && provider.getProviderType() !== "local") {
      const { chatCompletion } = await import("./client");
      return {
        getProviderType: () => "groq",
        getModelId: () => cloudConfig.model,
        callModel: async (messages: ModelMessage[]): Promise<ModelStepResult> => {
          const res = await chatCompletion(cloudConfig, messages);
          return {
            provider: cloudConfig.provider,
            model: cloudConfig.model,
            content: res.content,
            toolProposal: res.toolProposal,
            usage: res.usage,
            latencyMs: res.latencyMs,
          };
        },
      };
    }
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
      code?: string;
      retryable?: boolean;
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

  // Identidade canônica compartilhada com chat/MCP; falha de DB cai em Nix default.
  const agent = await loadAgentIdentity(userId);

  // Resolve users.preferredModel → rota de catálogo (resolveCloudModelConfig)
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

  // Awareness de conectores: injeta o systemBlock do runtime de conectores
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
  const activeNodeId = cp.missionGraphRuntime?.activeNodeId;
  const missionGraph = mission.missionGraph as
    | { version?: number; nodes?: Array<Record<string, unknown>> }
    | null;
  const hasPersistedMissionGraph = mission.missionGraph !== null && mission.missionGraph !== undefined;
  if (
    hasPersistedMissionGraph &&
    (missionGraph?.version !== 2 || typeof activeNodeId !== "string")
  ) {
    return { error: "MISSION_GRAPH_ACTIVE_NODE_INVALID" };
  }
  if (activeNodeId != null && typeof activeNodeId !== "string") {
    return { error: "MISSION_GRAPH_ACTIVE_NODE_INVALID" };
  }
  const activeNode = typeof activeNodeId === "string" && missionGraph?.version === 2 && Array.isArray(missionGraph.nodes)
    ? missionGraph.nodes.find((candidate) => candidate.id === activeNodeId)
    : undefined;
  if (typeof activeNodeId === "string" && !activeNode) {
    return { error: "MISSION_GRAPH_ACTIVE_NODE_INVALID" };
  }
  if (activeNode && !Object.prototype.hasOwnProperty.call(activeNode, "specialistProfileId")) {
    return { error: "MISSION_GRAPH_SPECIALIST_POLICY_INVALID" };
  }
  if (
    activeNode &&
    activeNode.specialistProfileId !== null &&
    typeof activeNode.specialistProfileId !== "string"
  ) {
    return { error: "MISSION_GRAPH_SPECIALIST_POLICY_INVALID" };
  }
  const specialistProfileId =
    activeNode?.specialistProfileId === null || typeof activeNode?.specialistProfileId === "string"
      ? activeNode.specialistProfileId
      : null;
  const rawRequiredCapabilities = activeNode?.requiredCapabilities;
  if (
    activeNode &&
    (!Array.isArray(rawRequiredCapabilities) ||
      !rawRequiredCapabilities.every((capability) => typeof capability === "string"))
  ) {
    return { error: "MISSION_GRAPH_SPECIALIST_POLICY_INVALID" };
  }
  const requiredCapabilities = (rawRequiredCapabilities ?? []) as string[];
  const specialistResolution = resolveSpecialistPolicy(specialistProfileId, requiredCapabilities);
  if (!specialistResolution.ok) {
    return {
      error: "MISSION_GRAPH_SPECIALIST_POLICY_INVALID",
      code: specialistResolution.reason,
    };
  }
  const specialist = specialistResolution.profile;

  const cpWithMode: CheckpointShape = {
    ...cp,
    modelMode: effectiveMode,
  };

  const userPrompt = [
    `Mission objective: ${mission.objective}`,
    (() => {
      if (!activeNode) return null;
      return [
        `Active serial mission node: ${String(activeNode.title ?? activeNode.id)}`,
        specialist ? `Assigned specialist: ${specialist.label}` : null,
        typeof activeNode.description === "string" ? `Node description: ${activeNode.description}` : null,
        typeof activeNode.definitionOfDone === "string" ? `Node definition of done: ${activeNode.definitionOfDone}` : null,
        "Work only on this active node. Do not begin a later node; the durable worker will release it after this node is verified.",
      ].filter(Boolean).join("\n");
    })(),
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
    { role: "system", content: buildSystemPrompt(agent, connectorBlock, execution.missionId, specialist) },
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
    const failure = classifyModelError(e, {
      provider: provider.getProviderType(),
      model: provider.getModelId(),
    });

    try {
      const errEvidenceId = randomUUID();
      const errItem: EvidenceItem = {
        id: errEvidenceId,
        type: "model_error",
        content: failure.code,
        source: EVIDENCE_MODEL_SOURCE,
        taskId: execution.currentTaskId,
        missionId: execution.missionId,
        executionId,
        metadata: {
          ...(cp.missionGraphRuntime?.activeNodeId
            ? { missionNodeId: cp.missionGraphRuntime.activeNodeId, graphVersion: 2 }
            : {}),
          category: failure.category,
          retryable: failure.retryable,
          provider: failure.provider,
          model: failure.model,
          httpStatus: failure.httpStatus,
        },
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

    return {
      error: "MODEL_CALL_FAILED" as const,
      code: failure.code,
      retryable: failure.retryable,
      detail: failure.code,
      hint: failure.hint,
    };
  }

  const now = new Date();
  const evidenceId = randomUUID();
  const stepIndex = (cp.stepIndex ?? 0) + 1;

  const evidenceItem: EvidenceItem = {
    id: evidenceId,
    type: "model_step",
    content: sanitizeText(modelResult.content || "(empty model response)"),
    source: EVIDENCE_MODEL_SOURCE,
    taskId: execution.currentTaskId,
    missionId: execution.missionId,
    executionId,
    ...(cp.missionGraphRuntime?.activeNodeId
      ? { metadata: { missionNodeId: cp.missionGraphRuntime.activeNodeId, graphVersion: 2 } }
      : {}),
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
