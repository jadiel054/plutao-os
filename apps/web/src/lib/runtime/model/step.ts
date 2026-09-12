import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { agents, executions, missions, tasks } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";
import { dispatchTool } from "@/lib/runtime/tools/dispatcher";
import { chatCompletion } from "./client";
import { getModelConfig } from "./config";
import type { ModelMessage } from "./types";

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

Available tools: note, filesystem
Rules:
- Stay consistent with the agent identity above.
- Prefer a tool call only when it helps the mission.
- For filesystem: use valid JSON input with action (list/read/write/mkdir/stat) and payload.path
- filesystem paths are relative to a secure sandbox
- Never invent other tool names.
- Keep replies concise.`;
}

type CheckpointShape = {
  step?: string;
  stepIndex?: number;
  taskId?: string | null;
  note?: string;
  evidenceId?: string;
  completedTaskIds?: string[];
  toolCalls?: string[];
  lastModel?: { provider: string; model: string; evidenceId: string };
};

function asCp(raw: unknown): CheckpointShape {
  if (raw && typeof raw === "object") return raw as CheckpointShape;
  return {};
}

export async function runModelStep(
  executionId: string,
  userId: string,
  additionalMessages: ModelMessage[] = []
) {
  const config = getModelConfig();
  if (!config) {
    return { error: "MODEL_NOT_CONFIGURED" as const };
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

  const userPrompt = [
    `Mission objective: ${mission.objective}`,
    mission.definitionOfDone ? `Definition of done: ${mission.definitionOfDone}` : null,
    `Execution status: ${execution.status}`,
    `Checkpoint: ${JSON.stringify(cp)}`,
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

  let modelResult;
  try {
    modelResult = await chatCompletion(config, messages);
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
    source: `model:${modelResult.provider}`,
    taskId: execution.currentTaskId,
    missionId: execution.missionId,
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
    note: `model ${modelResult.provider}/${modelResult.model}`,
    evidenceId,
    lastModel: {
      provider: modelResult.provider,
      model: modelResult.model,
      evidenceId,
    },
  };

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
