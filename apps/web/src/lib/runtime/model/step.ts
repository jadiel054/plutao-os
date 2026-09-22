/**
 * Model Step - Execução de passo do modelo com integração híbrida (Online/Offline)
 *
 * Implementa:
 * - Chamada ao modelo (Groq ou Local)
 * - Persistência de checkpoints no banco de dados
 * - Integração com LocalProvider para modo offline
 * - Tool dispatch automático
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { agents, executions, missions, tasks } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { saveCheckpoint } from "@/lib/runtime/checkpoint";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";
import { dispatchTool } from "@/lib/runtime/tools/dispatcher";
import { ModelProviderFactory, setModelProviderMode } from "./provider";
import type { ModelMessage, ModelStepResult } from "./types";
import type { ModelMode } from "@plutao/domain";

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

async function getModelProvider(mode: ModelMode): Promise<ModelProviderLike | null> {
  try {
    const provider = await ModelProviderFactory.getProvider({ mode });
    return provider as ModelProviderLike;
  } catch (error) {
    console.error("[getModelProvider]", error);
    return null;
  }
}

async function callModelWithProvider(
  provider: ModelProviderLike,
  messages: ModelMessage[]
): Promise<{
  result: ModelStepResult;
  providerType: "groq" | "local";
  modelId: string;
}> {
  const startTime = Date.now();
  const result = await provider.callModel(messages);
  const latencyMs = Date.now() - startTime;

  return {
    result: {
      ...result,
      latencyMs,
    },
    providerType: provider.getProviderType(),
    modelId: provider.getModelId(),
  };
}

function buildSystemPrompt(agent: {
  name: string;
  identity: string | null;
  personality: string | null;
} | null) {
  const identityLines = agent
    ? [
        `Agent name: ${agent.name}`,
        agent.identity ? `Identity: ${agent.identity}` : null,
        agent.personality ? `Personality: ${agent.personality}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Agent: Plutão (default)";

  return `You are the decision component of Plutão OS runtime.
You do NOT control the runtime. You only propose the next action.

${identityLines}

You may either:
1) Reply with short reasoning in plain text, OR
2) Propose exactly one tool call as JSON only:
{"tool":"note","input":"text to record"}
or
{"tool":"filesystem","input":"{\"action\":\"list\",\"payload\":{\"path\":\"dir\"}}"}
or
{"tool":"github","input":"{\"action\":\"repos_list\"}"}
{"tool":"github","input":"{\"action\":\"issues_list\",\"owner\":\"ORG\",\"repo\":\"REPO\"}"}

Available tools: note, filesystem, github
GitHub actions: repos_list | repo_get | issues_list | issues_get | pulls_list | actions_list
(github requires the user to have connected GitHub OAuth; otherwise the tool returns an error recorded as evidence)
Rules:
- Stay consistent with the agent identity above.
- Prefer a tool call only when it helps the mission.
- For filesystem: valid JSON with action (list/read/write/mkdir/stat) and payload.path
- For github: valid JSON with action and owner/repo/number when required
- Never invent other tool names.
- Keep replies concise.`;
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

  const provider = await getModelProvider(effectiveMode);

  if (!provider) {
    return { error: "MODEL_PROVIDER_NOT_AVAILABLE" as const };
  }

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
    { role: "system", content: buildSystemPrompt(agent) },
    { role: "user", content: userPrompt },
    ...additionalMessages,
  ];

  let modelResult: ModelStepResult;
  let providerType: "groq" | "local";
  let modelId: string;

  try {
    const callResult = await callModelWithProvider(provider, messages);
    modelResult = callResult.result;
    providerType = callResult.providerType;
    modelId = callResult.modelId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "model call failed";
    return { error: "MODEL_CALL_FAILED" as const, detail: msg };
  }

  const now = new Date();
  const evidenceId = randomUUID();
  const stepIndex = (cp.stepIndex ?? 0) + 1;

  const evidenceItem: EvidenceItem = {
    id: evidenceId,
    type: "model_step",
    content: modelResult.content || "(empty model response)",
    source: `model:${providerType}:${modelId}`,
    taskId: execution.currentTaskId,
    missionId: execution.missionId,
    executionId,
    createdAt: now.toISOString(),
  };

  const prevEv = parseEvidence(mission.evidence);
  await db
    .update(missions)
    .set({ evidence: [...prevEv, evidenceItem], updatedAt: now })
    .where(eq(missions.id, execution.missionId));

  const nextCp: CheckpointShape = {
    ...cp,
    step: "model_step",
    stepIndex,
    taskId: execution.currentTaskId,
    note: `model ${providerType}/${modelId}`,
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
