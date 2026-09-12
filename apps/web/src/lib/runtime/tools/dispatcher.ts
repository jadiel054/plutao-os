import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { executions, missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";
import { runNote } from "./note";
import { runFilesystem } from "./filesystem";
import { isToolName, type ToolName, type ToolResult } from "./types";

function inputHash(name: string, input: string): string {
  return createHash("sha256").update(`${name}\0${input}`).digest("hex").slice(0, 16);
}

async function dispatchLocal(name: ToolName, input: string): Promise<ToolResult> {
  switch (name) {
    case "note":
      return runNote(input);
    case "filesystem":
      return await runFilesystem(input);
    default: {
      const _exhaustive: never = name;
      return {
        ok: false,
        tool: String(_exhaustive),
        input,
        error: "tool não implementada",
        durationMs: 0,
      };
    }
  }
}

type CheckpointShape = {
  step?: string;
  stepIndex?: number;
  taskId?: string | null;
  note?: string;
  evidenceId?: string;
  completedTaskIds?: string[];
  toolCalls?: string[];
  lastTool?: { name: string; hash: string; evidenceId: string };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

function asCp(raw: unknown): CheckpointShape {
  if (raw && typeof raw === "object") return raw as CheckpointShape;
  return {};
}

/**
 * Tool Dispatcher: run one tool against a RUNNING execution,
 * persist evidence + checkpoint. Idempotent on (tool, input hash).
 */
export async function dispatchTool(opts: {
  executionId: string;
  userId: string;
  name: string;
  input: string;
  taskId?: string | null;
}) {
  if (!isToolName(opts.name)) {
    return { error: "UNKNOWN_TOOL" as const, known: ["note", "filesystem"] as const };
  }

  const execution = await getOwnedExecution(opts.executionId, opts.userId);
  if (!execution) return { error: "NOT_FOUND" as const };

  const status = execution.status as ExecutionStatus;
  if (status === "PAUSED" || status === "INTERRUPTED") {
    return { error: "NOT_RUNNING" as const, hint: "resume before tool" };
  }
  if (!RECOVERABLE.has(status)) {
    return { error: "TERMINAL" as const };
  }

  const hash = inputHash(opts.name, String(opts.input ?? ""));
  const cp = asCp(execution.checkpoint);
  const calls = new Set(cp.toolCalls ?? []);
  const callKey = `${opts.name}:${hash}`;

  if (calls.has(callKey) && cp.lastTool?.hash === hash && cp.lastTool?.name === opts.name) {
    return {
      applied: false as const,
      idempotent: true as const,
      execution,
      message: "tool call already recorded",
      evidenceId: cp.lastTool.evidenceId,
    };
  }

  const result = await dispatchLocal(opts.name, String(opts.input ?? ""));
  const now = new Date();
  const evidenceId = randomUUID();
  const taskId = opts.taskId ?? execution.currentTaskId ?? null;
  const stepIndex = (cp.stepIndex ?? 0) + 1;

  const evidenceItem: EvidenceItem = {
    id: evidenceId,
    type: result.ok ? "tool_result" : "tool_error",
    content: result.ok
      ? `tool:${result.tool} → ${result.output}`
      : `tool:${result.tool} error: ${result.error}`,
    source: "tool_dispatcher",
    taskId,
    missionId: execution.missionId,
    createdAt: now.toISOString(),
  };

  const db = getDb();
  const missionRows = await db
    .select({ evidence: missions.evidence })
    .from(missions)
    .where(and(eq(missions.id, execution.missionId), eq(missions.userId, opts.userId)))
    .limit(1);
  if (!missionRows[0]) return { error: "NOT_FOUND" as const };

  const prevEv = parseEvidence(missionRows[0].evidence);
  // secondary idempotency: same tool+hash in evidence content prefix
  const already = prevEv.some(
    (e) =>
      e.source === "tool_dispatcher" &&
      e.content.includes(`tool:${opts.name}`) &&
      (cp.toolCalls ?? []).includes(callKey)
  );
  if (already) {
    return {
      applied: false as const,
      idempotent: true as const,
      execution,
      message: "tool evidence already present",
    };
  }

  await db
    .update(missions)
    .set({ evidence: [...prevEv, evidenceItem], updatedAt: now })
    .where(eq(missions.id, execution.missionId));

  calls.add(callKey);
  const nextCp: CheckpointShape = {
    ...cp,
    step: `tool:${opts.name}`,
    stepIndex,
    taskId,
    note: result.ok ? `tool ${opts.name} ok` : `tool ${opts.name} failed`,
    evidenceId,
    toolCalls: [...calls],
    lastTool: { name: opts.name, hash, evidenceId },
    before: { tool: opts.name, inputHash: hash },
    after: result.ok
      ? { ok: true, outputLen: result.output.length }
      : { ok: false, error: result.error },
  };

  const updated = await db
    .update(executions)
    .set({
      checkpoint: nextCp,
      checkpointAt: now,
      updatedAt: now,
      currentTaskId: taskId,
      status: "RUNNING",
    })
    .where(eq(executions.id, opts.executionId))
    .returning();

  return {
    applied: true as const,
    idempotent: false as const,
    execution: updated[0],
    result,
    evidence: evidenceItem,
    message: result.ok ? "tool applied" : "tool failed (recorded)",
  };
}
