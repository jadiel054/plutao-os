import { randomUUID } from "node:crypto";
import { getOwnedMission } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { capabilityBlockReason } from "@/lib/capabilities/registry";
import { guardWrite } from "@/lib/connectors/writeGateGuard";
import { sanitizeError, sanitizeText } from "@/lib/security/sanitize";
import {
  createArtemisTask,
  findActiveArtemisTaskForDevice,
  getArtemisTaskByNonce,
  toArtemisTaskPublic,
  updateArtemisTask,
} from "@/lib/artemis/service";
import {
  dispatchWorkflow,
  getArtemisDefaultDevice,
  isArtemisEnabled,
} from "@/lib/artemis/client";
import type { ArtemisTaskInput } from "@/lib/artemis/types";
import type { ToolResult } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[a-zA-Z0-9._:-]{1,200}$/;
const MAX_PROMPT = 4_000;

function failure(input: string, error: string, startedAt: number): ToolResult {
  return {
    ok: false,
    tool: "artemis",
    input,
    error: sanitizeText(error).slice(0, 500),
    durationMs: Date.now() - startedAt,
  };
}

function success(input: string, output: string, startedAt: number): ToolResult {
  return {
    ok: true,
    tool: "artemis",
    input,
    output: sanitizeText(output).slice(0, 2_000),
    durationMs: Date.now() - startedAt,
  };
}

function parseInput(raw: string): ArtemisTaskInput | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "ARTEMIS_INPUT_MUST_BE_JSON" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "ARTEMIS_INPUT_INVALID" };
  }
  const body = value as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
  const deviceSerial =
    typeof body.deviceSerial === "string" && body.deviceSerial.trim()
      ? body.deviceSerial.trim()
      : getArtemisDefaultDevice();
  const profile = body.profile == null || body.profile === "" ? "flash" : String(body.profile);

  if (!prompt || prompt.length > MAX_PROMPT) return { error: `ARTEMIS_PROMPT_LENGTH_INVALID_MAX_${MAX_PROMPT}` };
  if (!nonce || !UUID_RE.test(nonce)) return { error: "ARTEMIS_NONCE_MUST_BE_UUID" };
  if (!deviceSerial || !DEVICE_RE.test(deviceSerial)) return { error: "ARTEMIS_DEVICE_INVALID_OR_NOT_CONFIGURED" };
  if (profile !== "flash") return { error: "ARTEMIS_ONLY_FLASH_PROFILE_IS_ENABLED" };

  return {
    prompt,
    deviceSerial,
    profile: "flash",
    nonce,
    missionId: typeof body.missionId === "string" && body.missionId.trim() ? body.missionId.trim() : null,
    nodeId: typeof body.nodeId === "string" && body.nodeId.trim() ? body.nodeId.trim() : null,
    _gateId: typeof body._gateId === "string" && body._gateId.trim() ? body._gateId.trim() : null,
  };
}

function outputForTask(task: ReturnType<typeof toArtemisTaskPublic>, runId?: string | null): string {
  return [
    "ARTEMIS_DISPATCHED",
    `artemis_task_id: ${task.id}`,
    `status: ${task.status}`,
    `device: ${task.deviceSerial}`,
    `profile: ${task.profile}`,
    `github_run_id: ${runId ?? task.githubRunId ?? "pending"}`,
    "A execução é assíncrona; aguarde o poller para a evidência final.",
  ].join("\n");
}

export async function runArtemis(
  inputJson: string,
  userId: string,
  executionId?: string
): Promise<ToolResult> {
  const startedAt = Date.now();
  if (!isArtemisEnabled()) {
    return failure(inputJson, "ARTEMIS_DISABLED: habilite ARTEMIS_ENABLED=true no ambiente server-side.", startedAt);
  }

  const blocked = capabilityBlockReason("artemis", "device_execute");
  if (blocked) return failure(inputJson, blocked, startedAt);

  const parsed = parseInput(inputJson);
  if ("error" in parsed) return failure(inputJson, parsed.error, startedAt);
  const deviceSerial = parsed.deviceSerial;
  const profile = parsed.profile === "flash" ? parsed.profile : "flash";
  if (!deviceSerial) return failure(inputJson, "ARTEMIS_DEVICE_INVALID_OR_NOT_CONFIGURED", startedAt);

  const execution = executionId ? await getOwnedExecution(executionId, userId) : null;
  if (executionId && !execution) return failure(inputJson, "EXECUTION_NOT_FOUND", startedAt);

  const missionId = parsed.missionId ?? execution?.missionId ?? null;
  if (parsed.missionId && execution && parsed.missionId !== execution.missionId) {
    return failure(inputJson, "MISSION_EXECUTION_MISMATCH", startedAt);
  }
  if (missionId && !(await getOwnedMission(missionId, userId))) {
    return failure(inputJson, "MISSION_NOT_FOUND", startedAt);
  }

  const existing = await getArtemisTaskByNonce(parsed.nonce, userId);
  if (existing) {
    return success(
      inputJson,
      outputForTask(toArtemisTaskPublic(existing), existing.githubRunId) + "\nnonce já processado; resposta idempotente.",
      startedAt
    );
  }
  const nonceOwner = await getArtemisTaskByNonce(parsed.nonce);
  if (nonceOwner && nonceOwner.userId !== userId) {
    return failure(inputJson, "ARTEMIS_NONCE_ALREADY_USED", startedAt);
  }

  const activeDeviceTask = await findActiveArtemisTaskForDevice(deviceSerial);
  if (activeDeviceTask) {
    return failure(inputJson, "ARTEMIS_DEVICE_BUSY: já existe uma task pendente ou em execução para este device.", startedAt);
  }

  const checkpoint = execution?.checkpoint && typeof execution.checkpoint === "object" ? execution.checkpoint as Record<string, unknown> : {};
  const graphRuntime = checkpoint.missionGraphRuntime && typeof checkpoint.missionGraphRuntime === "object"
    ? checkpoint.missionGraphRuntime as Record<string, unknown>
    : {};
  const nodeId = parsed.nodeId ?? (typeof graphRuntime.activeNodeId === "string" ? graphRuntime.activeNodeId : null);
  const payload = {
    prompt: parsed.prompt,
    deviceSerial: parsed.deviceSerial,
    profile: parsed.profile,
    nonce: parsed.nonce,
  };

  const guard = await guardWrite({
    userId,
    provider: "artemis",
    capability: "device_execute",
    target: `device:${parsed.deviceSerial}`,
    summary: `Executar instrução ARTEMIS no device ${parsed.deviceSerial}: ${sanitizeText(parsed.prompt).slice(0, 180)}`,
    payload,
    contentPreview: sanitizeText(parsed.prompt).slice(0, 240),
    missionId,
    executionId: executionId ?? null,
    gateId: parsed._gateId ?? null,
  });

  if (guard.kind === "refused") return failure(inputJson, guard.error, startedAt);
  if (guard.kind === "gate_pending") return success(inputJson, guard.output, startedAt);

  let task: Awaited<ReturnType<typeof createArtemisTask>> | null = null;
  try {
    task = await createArtemisTask({
      userId,
      missionId,
      executionId: executionId ?? null,
      nodeId,
      nonce: parsed.nonce,
      prompt: parsed.prompt,
      deviceSerial,
      profile,
      gateId: guard.gateId,
    });

    const dispatched = await dispatchWorkflow(parsed.nonce, parsed.prompt, deviceSerial, profile);
    const updated = await updateArtemisTask(task.id, {
      githubRunId: dispatched.githubRunId,
      githubRunAttempt: dispatched.githubRunAttempt,
    });
    const publicTask = toArtemisTaskPublic(updated ?? task);
    const output = outputForTask(publicTask, dispatched.githubRunId);
    await guard.finalize({ ok: true, output });
    return success(inputJson, output, startedAt);
  } catch (error) {
    const safeError = sanitizeError(error, "ARTEMIS_DISPATCH_FAILED");
    if (task) await updateArtemisTask(task.id, { status: "failed", error: safeError, summary: "Falha ao despachar workflow GitHub Actions." });
    await guard.finalize({ ok: false, error: safeError });
    return failure(inputJson, safeError, startedAt);
  }
}

export { randomUUID };
