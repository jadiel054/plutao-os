import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { artifacts, missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { emitAction, emitObservation } from "@/lib/events/appendConversationEvent";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { sanitizeError, sanitizeText } from "@/lib/security/sanitize";
import {
  cancelWorkflowRun,
  downloadArtifacts,
  getRunFailureSummary,
  getRunStatus,
} from "./client";
import {
  listActiveArtemisTasks,
  transitionArtemisTask,
  updateArtemisTask,
} from "./service";
import type { ArtemisArtifactDownload } from "./types";

const TASK_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_EVIDENCE = 2_000;

function zipEntryNames(bytes: Buffer): string[] {
  const names: string[] = [];
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const eocd = bytes.lastIndexOf(eocdSignature);
  if (eocd < 0 || eocd + 22 > bytes.length) return names;
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  let cursor = centralOffset;
  const end = Math.min(bytes.length, centralOffset + centralSize);
  while (cursor + 46 <= end && bytes.subarray(cursor, cursor + 4).equals(centralSignature)) {
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) break;
    names.push(bytes.subarray(nameStart, nameEnd).toString("utf8"));
    cursor = nameEnd + extraLength + commentLength;
  }
  return names;
}

function safeBlobName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160) || "artemis-traces";
}

async function persistArtifact(task: { id: string; userId: string; missionId: string | null; executor?: string }, artifact: ArtemisArtifactDownload) {
  const executor = task.executor || "artemis";
  const key = `${executor}/${task.userId}/${task.id}/${safeBlobName(artifact.name)}.zip`;
  const blob = await put(key, artifact.bytes, {
    access: "private",
    contentType: "application/zip",
    addRandomSuffix: false,
  });
  const files = zipEntryNames(artifact.bytes);
  const rows = await getDb()
    .insert(artifacts)
    .values({
      userId: task.userId,
      missionId: task.missionId,
      name: artifact.name,
      type: "application/zip",
      size: artifact.size,
      content: "",
      metadata: {
        blobUrl: blob.url,
        source: executor,
        artemisTaskId: task.id,
        files,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: artifacts.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("ARTEMIS_ARTIFACT_NOT_PERSISTED");
  return {
    id,
    traceUrl: `/api/artifacts/${id}/content`,
    files,
    blobUrl: blob.url,
  };
}

export async function appendTerminalEvidence(opts: {
  task: Awaited<ReturnType<typeof listActiveArtemisTasks>>[number];
  status: string;
  content: string;
  traceUrl?: string | null;
  artifactId?: string | null;
  screenshots?: string[];
  nodeId?: string | null;
}) {
  if (!opts.task.missionId) return;
  const db = getDb();
  const missionRows = await db
    .select({ evidence: missions.evidence, conversationId: missions.conversationId })
    .from(missions)
    .where(and(eq(missions.id, opts.task.missionId), eq(missions.userId, opts.task.userId)))
    .limit(1);
  const mission = missionRows[0];
  if (!mission) return;

  const previous = parseEvidence(mission.evidence);
  if (previous.some((item) => item.metadata?.artemisTaskId === opts.task.id)) return;

  const evidence: EvidenceItem = {
    id: crypto.randomUUID(),
    type: opts.status === "done" ? "tool_result" : "tool_error",
    content: sanitizeText(opts.content).slice(0, MAX_EVIDENCE),
    source: "artemis_poller",
    taskId: null,
    missionId: opts.task.missionId,
    executionId: opts.task.executionId ?? undefined,
    metadata: {
      artemisTaskId: opts.task.id,
      ...(opts.nodeId ? { missionNodeId: opts.nodeId, graphVersion: 2 } : {}),
      ...(opts.traceUrl ? { traceUrl: opts.traceUrl } : {}),
      ...(opts.artifactId ? { artifactId: opts.artifactId } : {}),
      screenshots: opts.screenshots ?? [],
    },
    createdAt: new Date().toISOString(),
  };

  await db
    .update(missions)
    .set({ evidence: [...previous, evidence], updatedAt: new Date() })
    .where(and(eq(missions.id, opts.task.missionId), eq(missions.userId, opts.task.userId)));

  if (mission.conversationId) {
    await emitAction({
      conversationId: mission.conversationId,
      tool: opts.task.executor,
      inputSummary: `task ${opts.task.id} · ${opts.task.deviceSerial}`,
      source: `${opts.task.executor}_poller`,
    });
    await emitObservation({
      conversationId: mission.conversationId,
      tool: opts.task.executor,
      ok: opts.status === "done",
      outputOrError: sanitizeText(opts.content),
      source: `${opts.task.executor}_poller`,
    });
  }
}

async function processOne(task: Awaited<ReturnType<typeof listActiveArtemisTasks>>[number]) {
  if (!task.githubRunId) {
    await updateArtemisTask(task.id, { summary: "Workflow dispatchado; aguardando o GitHub expor o run id." });
    return { id: task.id, status: task.status, action: "waiting_run_id" };
  }

  const age = Date.now() - new Date(task.createdAt).getTime();
  if (task.status === "running" && age > TASK_TIMEOUT_MS) {
    try {
      await cancelWorkflowRun(task.githubRunId);
    } catch (error) {
      console.error("[artemis poller timeout cancel]", sanitizeError(error));
    }
    const timeoutTask = await transitionArtemisTask(task.id, "running", "timeout", {
      error: "ARTEMIS_TIMEOUT_30_MINUTES",
      summary: "A execução excedeu o limite de 30 minutos e foi cancelada.",
      cancelReason: "ARTEMIS_TIMEOUT_30_MINUTES",
      cancelledAt: new Date(),
    });
    if (timeoutTask) {
      await appendTerminalEvidence({
        task: timeoutTask,
        status: "timeout",
        content: `ARTEMIS timeout após 30 minutos no device ${timeoutTask.deviceSerial}.`,
      });
    }
    return { id: task.id, status: "timeout", action: "timeout" };
  }

  const run = await getRunStatus(task.githubRunId);
  if (run.status !== "completed") {
    const running = await transitionArtemisTask(task.id, ["pending", "running"], "running", {
      githubRunAttempt: run.runAttempt,
      summary: `GitHub Actions: ${run.status}`,
    });
    return { id: task.id, status: running?.status ?? "running", action: "running" };
  }

  const conclusion = String(run.conclusion ?? "").toLowerCase();
  if (["success", "neutral"].includes(conclusion)) {
    const downloaded = await downloadArtifacts(task.githubRunId, task.executor);
    let traceUrl: string | null = null;
    let artifactId: string | null = null;
    let screenshotNames: string[] = [];
    if (downloaded.length > 0) {
      const persisted = await persistArtifact(task, downloaded[0]!);
      traceUrl = persisted.traceUrl;
      artifactId = persisted.id;
      screenshotNames = persisted.files.filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
    }
    const done = await transitionArtemisTask(task.id, ["pending", "running"], "done", {
      githubRunAttempt: run.runAttempt,
      traceUrl,
      summary: downloaded.length > 0
        ? `${task.executor} concluído; artifact privado com ${screenshotNames.length} screenshot(s).`
        : `${task.executor} concluído, mas o workflow não publicou artifacts.`,
      error: null,
    });
    if (done) {
      await appendTerminalEvidence({
        task: done,
        status: "done",
        traceUrl,
        artifactId,
        screenshots: screenshotNames,
        content: [
          `${done.executor} concluído no device ${done.deviceSerial}.`,
          done.summary ?? "",
          traceUrl ? `Trace e screenshots: ${traceUrl}` : "Nenhum artifact foi publicado pelo workflow.",
          screenshotNames.length > 0 ? `Screenshots: ${screenshotNames.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      });
    }
    return { id: task.id, status: "done", action: "done" };
  }

  let failureSummary = `GitHub Actions concluiu com ${conclusion || "falha desconhecida"}.`;
  try {
    const jobs = await getRunFailureSummary(task.githubRunId);
    failureSummary = `${failureSummary}\n${jobs}`;
  } catch (error) {
    failureSummary = `${failureSummary}\n${sanitizeError(error, "LOGS_UNAVAILABLE")}`;
  }
  const failed = await transitionArtemisTask(task.id, ["pending", "running"], conclusion === "cancelled" ? "cancelled" : "failed", {
    githubRunAttempt: run.runAttempt,
    error: sanitizeText(failureSummary).slice(0, 2_000),
    summary: `Workflow ${task.executor} encerrado sem sucesso.`,
    ...(conclusion === "cancelled" ? { cancelReason: "GITHUB_RUN_CANCELLED", cancelledAt: new Date() } : {}),
  });
  if (failed) {
    await appendTerminalEvidence({
      task: failed,
      status: failed.status,
      content: `${failed.executor} ${failed.status} no device ${failed.deviceSerial}.\n${failureSummary}`,
    });
  }
  return { id: task.id, status: failed?.status ?? "failed", action: "failed" };
}

export async function processArtemisTasks(limit = 3) {
  const tasks = await listActiveArtemisTasks(limit);
  const processed: Array<Record<string, string>> = [];
  for (const task of tasks) {
    try {
      processed.push(await processOne(task));
    } catch (error) {
      const safeError = sanitizeError(error, "ARTEMIS_POLLER_FAILED");
      const failed = await transitionArtemisTask(task.id, ["pending", "running"], "failed", {
        error: safeError,
        summary: "O poller não conseguiu reconciliar a execução ARTEMIS.",
      });
      if (failed) {
        await appendTerminalEvidence({
          task: failed,
          status: "failed",
          content: `Falha no poller ARTEMIS: ${safeError}`,
        });
      }
      processed.push({ id: task.id, status: "failed", action: "poller_error" });
    }
  }
  return { processed, scanned: tasks.length };
}
