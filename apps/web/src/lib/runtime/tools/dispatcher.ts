import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { executions, missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { recordToolOnMissionPlan } from "@/lib/missions/planEvents";
import { getOwnedExecution } from "@/lib/runtime/service";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";
import { runNote } from "./note";
import { runFilesystem } from "./filesystem";
import { runGithub } from "./github";
import { runVercel } from "./vercel";
import { runSupabase } from "./supabase";
import { runTelegram } from "./telegram";
import { runCloudflare } from "./cloudflare";
import { runRender } from "./render";
import { runExportTool } from "./export";
import { isToolName, KNOWN_TOOLS, type ToolName, type ToolResult } from "./types";
import { evaluateInternalTool, isInternalTool } from "@/lib/capabilities/registry";
import { emitAction, emitObservation } from "@/lib/events/appendConversationEvent";
import { sanitizeText } from "@/lib/security/sanitize";

function inputHash(name: string, input: string): string {
  return createHash("sha256").update(`${name}\0${input}`).digest("hex").slice(0, 16);
}

async function dispatchLocal(
  name: ToolName,
  input: string,
  opts: { executionId?: string; userId: string }
): Promise<ToolResult> {
  switch (name) {
    case "note":
      return runNote(input);
    case "filesystem":
      return await runFilesystem(input, opts.executionId, opts.userId);
    case "github":
      return await runGithub(input, opts.userId, opts.executionId);
    case "vercel":
      return await runVercel(input, opts.userId, opts.executionId);
    case "supabase":
      return await runSupabase(input, opts.userId, opts.executionId);
    case "telegram":
      return await runTelegram(input, opts.userId, opts.executionId);
    case "cloudflare":
      return await runCloudflare(input, opts.userId, opts.executionId);
    case "render":
      return await runRender(input, opts.userId, opts.executionId);
    case "files.export_pdf":
    case "files.export_xlsx":
    case "files.export_markdown":
    case "files.export_html":
      return await runExportTool(name, input, opts.executionId, opts.userId);
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
  /** G3: conversa que originou a missão — alimenta o Computador. */
  conversationId?: string | null;
  missionGraphRuntime?: { activeNodeId?: string | null; [key: string]: unknown };
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
    return {
      error: "UNKNOWN_TOOL" as const,
      known: KNOWN_TOOLS,
    };
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

  // H6 — a deduplicação cobre todo o histórico da execution. Exigir apenas
  // lastTool permitia A → B → A em uma retomada e reexecutava A.
  if (calls.has(callKey)) {
    return {
      applied: false as const,
      idempotent: true as const,
      execution,
      message: "tool call already recorded",
      evidenceId:
        cp.lastTool?.name === opts.name && cp.lastTool.hash === hash
          ? cp.lastTool.evidenceId
          : undefined,
    };
  }

  // H6 — claim atômico por compare-and-swap do checkpoint. Sem isso, duas
  // requests simultâneas podem ler o mesmo histórico vazio e executar a tool
  // duas vezes antes que qualquer uma grave o novo checkpoint.
  const db = getDb();
  const claimedCheckpoint = {
    ...cp,
    toolCalls: [...calls, callKey],
  };
  const claimed = await db
    .update(executions)
    .set({ checkpoint: claimedCheckpoint, checkpointAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(executions.id, opts.executionId),
        eq(executions.userId, opts.userId),
        eq(executions.checkpoint, execution.checkpoint)
      )
    )
    .returning({ id: executions.id });
  if (!claimed[0]) {
    const current = await getOwnedExecution(opts.executionId, opts.userId);
    const currentCp = asCp(current?.checkpoint);
    if ((currentCp.toolCalls ?? []).includes(callKey)) {
      return {
        applied: false as const,
        idempotent: true as const,
        execution: current,
        message: "tool call claimed by another request",
      };
    }
    return { error: "CONCURRENT_TOOL_CLAIM" as const };
  }

  // H9 — registro de capacidades para tools INTERNAS (fail-closed).
  // Tools de conector validam a própria capability no executor/registry.
  if (isInternalTool(opts.name)) {
    const toolDecision = evaluateInternalTool(opts.name);
    if (!toolDecision.allowed) {
      return { error: "CAPABILITY_BLOCKED" as const, message: toolDecision.message };
    }
  }

  const result = await dispatchLocal(opts.name, String(opts.input ?? ""), {
    executionId: opts.executionId,
    userId: opts.userId,
  });
  const now = new Date();
  const evidenceId = randomUUID();
  const taskId = opts.taskId ?? execution.currentTaskId ?? null;
  const stepIndex = (cp.stepIndex ?? 0) + 1;

  const evidenceItem: EvidenceItem = {
    id: evidenceId,
    type: result.ok ? "tool_result" : "tool_error",
    content: sanitizeText(
      result.ok
        ? `tool:${result.tool} → ${result.output}`
        : `tool:${result.tool} error: ${result.error}`
    ),
    source: "tool_dispatcher",
    taskId,
    missionId: execution.missionId,
    executionId: opts.executionId,
    ...(cp.missionGraphRuntime?.activeNodeId
      ? { metadata: { missionNodeId: cp.missionGraphRuntime.activeNodeId, graphVersion: 2 } }
      : {}),
    createdAt: now.toISOString(),
  };

  const missionRows = await db
    .select({ evidence: missions.evidence })
    .from(missions)
    .where(and(eq(missions.id, execution.missionId), eq(missions.userId, opts.userId)))
    .limit(1);
  if (!missionRows[0]) return { error: "NOT_FOUND" as const };

  const prevEv = parseEvidence(missionRows[0].evidence);
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
    .where(and(eq(missions.id, execution.missionId), eq(missions.userId, opts.userId)));

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

  await recordToolOnMissionPlan({
    missionId: execution.missionId,
    userId: opts.userId,
    toolName: opts.name,
    ok: result.ok,
    outputOrError: sanitizeText(result.ok ? result.output : (result.error ?? "erro")),
    evidenceId,
  });

  const conversationId =
    (typeof cp.conversationId === "string" && cp.conversationId.trim()) ||
    (typeof nextCp.conversationId === "string" && nextCp.conversationId.trim()) ||
    null;
  if (conversationId) {
    const inputSummary = String(opts.input ?? "").slice(0, 240);
    try {
      await emitAction({
        conversationId,
        tool: opts.name,
        inputSummary: inputSummary || opts.name,
        source: "mission_runtime",
      });
      await emitObservation({
        conversationId,
        tool: opts.name,
        ok: result.ok,
        outputOrError: sanitizeText(result.ok ? result.output : (result.error ?? "erro")),
        source: "mission_runtime",
      });
    } catch (e) {
      console.error("[dispatchTool conversation events]", e);
    }
  }

  return {
    applied: true as const,
    idempotent: false as const,
    execution: updated[0],
    result,
    evidence: evidenceItem,
    message: result.ok ? "tool applied" : "tool failed (recorded)",
  };
}
