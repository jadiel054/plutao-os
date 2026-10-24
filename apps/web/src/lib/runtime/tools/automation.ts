import { getOwnedMission } from "@/lib/missions/ownership";
import { getOwnedExecution } from "@/lib/runtime/service";
import { capabilityBlockReason } from "@/lib/capabilities/registry";
import { guardWrite } from "@/lib/connectors/writeGateGuard";
import { sanitizeError, sanitizeText } from "@/lib/security/sanitize";
import {
  createArtemisTask,
  findActiveArtemisTaskForDevice,
  getArtemisTaskByNonce,
  updateArtemisTask,
} from "@/lib/artemis/service";
import { dispatchExecutorWorkflow } from "@/lib/artemis/client";
import { getArtemisDefaultDevice } from "@/lib/artemis/client";
import type { AutomationExecutor } from "@/lib/artemis/types";
import type { ToolName, ToolResult } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN_RE = /^[a-zA-Z0-9._:/-]{1,200}$/;
const MAX_PROMPT = 8_000;
const WRITE_EXECUTORS = new Set<AutomationExecutor>(["maestro", "appium", "playwright"]);
const TOOL_NAMES = new Set<AutomationExecutor>(["maestro", "appium", "playwright", "androidworld"]);

function fail(tool: ToolName, input: string, error: string, startedAt: number): ToolResult {
  return { ok: false, tool, input, error: sanitizeText(error).slice(0, 500), durationMs: Date.now() - startedAt };
}
function pass(tool: ToolName, input: string, output: string, startedAt: number): ToolResult {
  return { ok: true, tool, input, output: sanitizeText(output).slice(0, 2_000), durationMs: Date.now() - startedAt };
}

function enabled(executor: AutomationExecutor): boolean {
  if (executor === "artemis") return process.env.ARTEMIS_ENABLED?.trim().toLowerCase() === "true";
  return process.env.AUTOMATION_ENABLED?.trim().toLowerCase() !== "false";
}

function parse(raw: string, executor: Exclude<AutomationExecutor, "artemis">): Record<string, unknown> | { error: string } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { error: "AUTOMATION_INPUT_MUST_BE_JSON" }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "AUTOMATION_INPUT_INVALID" };
  const body = value as Record<string, unknown>;
  const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!nonce || !UUID_RE.test(nonce)) return { error: "AUTOMATION_NONCE_MUST_BE_UUID" };
  if (prompt.length > MAX_PROMPT) return { error: `AUTOMATION_PROMPT_TOO_LONG_MAX_${MAX_PROMPT}` };
  if (executor === "playwright") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) throw new Error(); } catch { return { error: "PLAYWRIGHT_URL_INVALID" }; }
    if (!Array.isArray(body.actions)) return { error: "PLAYWRIGHT_ACTIONS_MUST_BE_ARRAY" };
  }
  if (executor === "maestro" && !(typeof body.flow === "string" && body.flow.trim())) return { error: "MAESTRO_FLOW_REQUIRED" };
  if (executor === "appium" && !Array.isArray(body.actions)) return { error: "APPIUM_ACTIONS_MUST_BE_ARRAY" };
  if (executor === "androidworld" && !prompt) return { error: "ANDROIDWORLD_TASK_REQUIRED" };
  return { ...body, nonce, prompt, executor };
}

function workflowInputs(executor: Exclude<AutomationExecutor, "artemis">, body: Record<string, unknown>): Record<string, string> {
  const device = String(body.deviceSerial ?? getArtemisDefaultDevice() ?? "");
  if (executor === "maestro") return { flow: String(body.flow ?? ""), device_serial: device, device_tailnet_name: device };
  if (executor === "appium") return { actions_json: JSON.stringify(body.actions ?? []), device_serial: device, device_tailnet_name: device };
  if (executor === "playwright") {
    const url = String(body.url ?? "");
    return { url, actions_json: JSON.stringify(body.actions ?? []), allowed_hosts: new URL(url).hostname };
  }
  return { task: String(body.prompt ?? "") };
}

export async function runAutomationExecutor(
  executor: Exclude<AutomationExecutor, "artemis">,
  inputJson: string,
  userId: string,
  executionId?: string
): Promise<ToolResult> {
  const startedAt = Date.now();
  const tool = executor as ToolName;
  if (!TOOL_NAMES.has(executor) || !enabled(executor)) return fail(tool, inputJson, `${executor.toUpperCase()}_DISABLED`, startedAt);
  const capability = executor === "androidworld" ? "benchmark_execute" : executor === "playwright" ? "browser_execute" : "device_execute";
  const blocked = capabilityBlockReason(executor, capability);
  if (blocked) return fail(tool, inputJson, blocked, startedAt);
  const body = parse(inputJson, executor);
  if ("error" in body) return fail(tool, inputJson, String(body.error), startedAt);
  const nonce = String(body.nonce);
  const existing = await getArtemisTaskByNonce(nonce, userId);
  if (existing) return pass(tool, inputJson, `${executor.toUpperCase()}_DISPATCHED\ntask_id: ${existing.id}\nstatus: ${existing.status}\nnonce já processado; resposta idempotente.`, startedAt);
  if (await getArtemisTaskByNonce(nonce)) return fail(tool, inputJson, "AUTOMATION_NONCE_ALREADY_USED", startedAt);

  const execution = executionId ? await getOwnedExecution(executionId, userId) : null;
  if (executionId && !execution) return fail(tool, inputJson, "EXECUTION_NOT_FOUND", startedAt);
  const missionId = typeof body.missionId === "string" && body.missionId.trim() ? body.missionId.trim() : execution?.missionId ?? null;
  if (missionId && !(await getOwnedMission(missionId, userId))) return fail(tool, inputJson, "MISSION_NOT_FOUND", startedAt);
  if (missionId && execution && missionId !== execution.missionId) return fail(tool, inputJson, "MISSION_EXECUTION_MISMATCH", startedAt);

  const deviceSerial = String(body.deviceSerial ?? (executor === "playwright" ? "browser-runner" : getArtemisDefaultDevice() ?? ""));
  if (!SAFE_TOKEN_RE.test(deviceSerial)) return fail(tool, inputJson, "AUTOMATION_DEVICE_INVALID_OR_NOT_CONFIGURED", startedAt);
  if (executor !== "playwright" && executor !== "androidworld" && await findActiveArtemisTaskForDevice(deviceSerial)) {
    return fail(tool, inputJson, "AUTOMATION_DEVICE_BUSY", startedAt);
  }

  let finalize: ((outcome: { ok: boolean; output?: string; error?: string }) => Promise<void>) | null = null;
  let gateId: string | null = null;
  if (WRITE_EXECUTORS.has(executor)) {
    const gate = await guardWrite({
      userId, provider: executor, capability, target: `${executor}:${deviceSerial}`,
      summary: `${executor} automation: ${sanitizeText(String(body.prompt ?? body.url ?? body.flow ?? "")).slice(0, 180)}`,
      payload: { ...body, actions: Array.isArray(body.actions) ? body.actions : undefined },
      contentPreview: sanitizeText(String(body.prompt ?? body.url ?? body.flow ?? "")).slice(0, 240),
      missionId, executionId: executionId ?? null,
      gateId: typeof body._gateId === "string" ? body._gateId : null,
    });
    if (gate.kind === "refused") return fail(tool, inputJson, gate.error, startedAt);
    if (gate.kind === "gate_pending") return pass(tool, inputJson, gate.output, startedAt);
    gateId = gate.gateId;
    finalize = gate.finalize;
  }

  let task: Awaited<ReturnType<typeof createArtemisTask>> | null = null;
  try {
    task = await createArtemisTask({
      userId, missionId, executionId: executionId ?? null,
      nodeId: typeof body.nodeId === "string" ? body.nodeId : null,
      executor, nonce, prompt: String(body.prompt ?? body.url ?? body.flow ?? ""),
      deviceSerial, profile: "flash", gateId,
    });
    const dispatched = await dispatchExecutorWorkflow(executor, nonce, workflowInputs(executor, body));
    await updateArtemisTask(task.id, { githubRunId: dispatched.githubRunId, githubRunAttempt: dispatched.githubRunAttempt });
    const output = `${executor.toUpperCase()}_DISPATCHED\ntask_id: ${task.id}\nstatus: pending\ngithub_run_id: ${dispatched.githubRunId}\nA execução é assíncrona; aguarde o poller para evidence final.`;
    if (finalize) await finalize({ ok: true, output });
    return pass(tool, inputJson, output, startedAt);
  } catch (error) {
    const safe = sanitizeError(error, `${executor.toUpperCase()}_DISPATCH_FAILED`);
    if (task) await updateArtemisTask(task.id, { status: "failed", error: safe, summary: "Falha ao despachar executor." });
    if (finalize) await finalize({ ok: false, error: safe });
    return fail(tool, inputJson, safe, startedAt);
  }
}
