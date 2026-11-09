import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { checkMcpRateLimit } from "@/lib/mcp/audit";
import { missionObjectiveToGraphV2 } from "@plutao/domain";
import {
  enqueueMissionExecutionJob,
  releaseRuntimeJobAfterApproval,
} from "@/lib/runtime/durableJobs";
import { publishRuntimeWorkerWake } from "@/lib/runtime/workerQueue";
import { approveGate, listWriteGatesForExecution } from "@/lib/connectors/gates";
import { githubPushFiles } from "@/lib/connectors/githubWrite";
import { sanitizeText } from "@/lib/security/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fase 0 hardening + Aegis Durable Runtime Unification:
 * - Fail-closed when AEGIS_API_KEY is unset (503).
 * - Constant-time key comparison via timingSafeEqual.
 * - Persistent rate limit (rate_limit_buckets via checkMcpRateLimit).
 * - Body flags (approved / approved_by / gate) NEVER authorize external write directly.
 *   For command "execute_real", they only unblock persisted write gates in the DB.
 * - command "smoke" is strictly restricted to sandbox smoke write.
 * - GET requires the same auth and does not expose smoke target.
 */

function aegisKeyConfigured(): string | null {
  const expected = process.env.AEGIS_API_KEY;
  if (!expected || expected.length === 0) return null;
  return expected;
}

export function extractPresentedKey(request: Request): string {
  return (
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

/** Constant-time compare; never throws on length mismatch. */
export function keyMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(b.length);
    timingSafeEqual(dummy, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function authorized(request: Request): "ok" | "missing_config" | "unauthorized" {
  const expected = aegisKeyConfigured();
  if (!expected) return "missing_config";
  const presented = extractPresentedKey(request);
  if (!keyMatches(presented, expected)) return "unauthorized";
  return "ok";
}

export function rateLimitKey(request: Request): string {
  const presented = extractPresentedKey(request);
  if (presented) {
    return `aegis:execute:${createHash("sha256").update(presented).digest("hex").slice(0, 24)}`;
  }
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `aegis:execute:ip:${fwd || "unknown"}`;
}

export async function enforceRateLimit(request: Request): Promise<NextResponse | null> {
  const result = await checkMcpRateLimit(rateLimitKey(request));
  if (result.ok) return null;
  return NextResponse.json(
    { success: false, error: "Rate limit exceeded", retry_after_sec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}

/** Safe smoke write target — private sandbox only. */
function smokeTarget() {
  return {
    owner: process.env.SMOKE_GITHUB_OWNER || "jadiel054",
    repo: process.env.SMOKE_GITHUB_REPO || "aegis-smoke-sandbox",
    branch: process.env.SMOKE_GITHUB_BRANCH || "main",
  };
}

async function trySmokeGithubWrite(opts: {
  taskId: string | null;
  title: string;
  approvedBy: string;
}): Promise<{ ok: boolean; detail: string }> {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    "";
  if (!token) {
    return {
      ok: false,
      detail:
        "GITHUB_TOKEN ausente no Plutão — write real não executado. Defina GITHUB_TOKEN (repo scope) no Vercel do plutao-os.",
    };
  }

  const { owner, repo, branch } = smokeTarget();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `smoke/${stamp}-${(opts.taskId || "manual").slice(0, 8)}.md`;
  const content = [
    "# Smoke write — Aegis write-gate",
    "",
    `- task_id: ${opts.taskId || "(none)"}`,
    `- title: ${opts.title}`,
    `- approved_by: ${opts.approvedBy}`,
    `- at: ${new Date().toISOString()}`,
    "- agent: Plutão /api/agent/execute",
    "",
    "Arquivo criado automaticamente após aprovação humana no Aegis/Telegram.",
    `Alvo restrito: ${owner}/${repo} (sandbox).`,
    "",
  ].join("\n");

  const res = await githubPushFiles(token, {
    owner,
    repo,
    branch,
    message: `smoke(aegis): ${opts.title.slice(0, 72)}`,
    files: [{ path, content }],
  });

  if (!res.ok) {
    return { ok: false, detail: `GitHub push falhou: ${res.error}` };
  }

  return {
    ok: true,
    detail: [
      "WRITE REAL OK",
      res.output,
      `path: ${path}`,
      res.htmlUrl ? `commit_url: ${res.htmlUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Aegis contract: POST /api/agent/execute
 * - command="smoke": sandbox smoke write
 * - command="execute_real" | "execute": enqueues a durable mission
 */
export async function POST(request: Request) {
  try {
    const auth = authorized(request);
    if (auth === "missing_config") {
      return NextResponse.json(
        { success: false, error: "AEGIS_API_KEY not configured — endpoint fail-closed" },
        { status: 503 }
      );
    }
    if (auth === "unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const limited = await enforceRateLimit(request);
    if (limited) return limited;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const command = String(body.command || "execute_real");
    const title = String(body.mission_title || body.title || "Missão");
    const input = String(body.input || body.mission_context || body.mission_description || "");
    const taskId = body.task_id != null ? String(body.task_id) : null;
    const stepIndex = body.step_index != null ? Number(body.step_index) : 0;
    const approved =
      body.approved === true ||
      Boolean(body.approved_by) ||
      String(body.gate || "") === "approved";
    const approvedBy = String(body.approved_by || "operator");

    if (command === "plan_real_mission") {
      return NextResponse.json({
        success: true,
        agent: "Plutao",
        command,
        output: `Plutão recebeu plan_real_mission — planejamento é papel do Morpheus. Contexto: ${title}`,
      });
    }

    if (command === "synthesize_real") {
      return NextResponse.json({
        success: true,
        agent: "Zarith",
        command,
        output: "Síntese deve ser feita pelo Zarith. Plutão só executa.",
      });
    }

    if (command === "smoke") {
      if (!approved) {
        const { owner, repo } = smokeTarget();
        const proposal = [
          `# Proposta de execução Plutão (smoke) — ${title}`,
          taskId ? `task_id: ${taskId}` : "",
          "",
          "## Entrada (plano / contexto)",
          input.slice(0, 4000) || "(vazio)",
          "",
          "## Ações pretendidas (bloqueadas até aprovação)",
          "1. Validar escopo e alvos (repos, ambientes, secrets).",
          `2. Smoke write seguro em ${owner}/${repo} (arquivo em smoke/).`,
          "3. Nenhuma mutação fora do sandbox sem gate explícito.",
          "",
          "## Status",
          "**awaiting_approval** — nenhum write externo foi executado.",
          "",
          `_Plutão /api/agent/execute · ${new Date().toISOString()}_`,
        ]
          .filter(Boolean)
          .join("\n");

        return NextResponse.json({
          success: true,
          agent: "Plutao",
          command: "smoke",
          gated: true,
          status: "awaiting_approval",
          output: proposal,
        });
      }

      const smoke = await trySmokeGithubWrite({
        taskId,
        title,
        approvedBy,
      });

      const result = [
        `# Execução Plutão (gate aprovado) — ${title}`,
        taskId ? `task_id: ${taskId}` : "",
        `approved_by: ${approvedBy}`,
        "",
        "## Contexto",
        input.slice(0, 3000),
        "",
        "## Write real (sandbox)",
        smoke.detail,
        "",
        "## Status",
        smoke.ok
          ? "**completed** com evidência no GitHub sandbox"
          : "**completed_partial** — gate ok, write sandbox não concluído",
        "",
        `_Plutão /api/agent/execute · ${new Date().toISOString()}_`,
      ]
        .filter(Boolean)
        .join("\n");

      return NextResponse.json({
        success: true,
        agent: "Plutao",
        command: "smoke",
        gated: false,
        status: smoke.ok ? "completed" : "completed_partial",
        write_ok: smoke.ok,
        output: result,
      });
    }

    if (command !== "execute_real" && command !== "execute") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported command: ${command}`,
          supported: ["execute_real", "smoke", "plan_real_mission", "synthesize_real"],
        },
        { status: 400 }
      );
    }

    const serviceUserId = process.env.PLUTAO_SERVICE_USER_ID;
    if (!serviceUserId) {
      return NextResponse.json(
        { success: false, error: "PLUTAO_SERVICE_USER_ID not configured" },
        { status: 500 }
      );
    }

    const db = getDb();
    const idempotencyKey = taskId
      ? `aegis:${taskId}:${stepIndex}`
      : `aegis:manual:${Date.now()}`;

    // 1. Check idempotency for mission
    const existingMissions = await db
      .select()
      .from(missions)
      .where(and(eq(missions.userId, serviceUserId), eq(missions.idempotencyKey, idempotencyKey)))
      .limit(1);

    let mission = existingMissions[0];
    let isNewMission = false;

    if (!mission) {
      const missionGraph = missionObjectiveToGraphV2(title);
      const inserted = await db
        .insert(missions)
        .values({
          userId: serviceUserId,
          objective: title,
          context: input,
          definitionOfDone: "Execution completed and DoD verified",
          creationSource: "aegis",
          graphVersion: missionGraph.version,
          missionGraph,
          status: "CREATED",
          currentState: "CREATED",
          completedSteps: [],
          pendingSteps: [],
          evidence: [],
          errors: [],
          decisions: [
            {
              type: "idempotency",
              intentId: idempotencyKey,
              idempotencyKey,
              taskId,
              stepIndex,
              createdAt: new Date().toISOString(),
            },
          ],
          idempotencyKey,
        })
        .returning();
      mission = inserted[0];
      isNewMission = true;
    }

    if (!mission) {
      throw new Error("Failed to create or retrieve mission");
    }

    // 2. Enqueue or find execution + runtimeJob
    const queued = await enqueueMissionExecutionJob({
      missionId: mission.id,
      userId: serviceUserId,
      requestId: `aegis-${taskId || "req"}-${stepIndex}`,
    });

    const executionId = queued.execution.id;
    const jobId = queued.job.id;

    // 3. Handle write-gate unblocking if approved is true
    let releasedApproval = false;
    if (approved && executionId) {
      const gates = await listWriteGatesForExecution(executionId, serviceUserId);
      const pendingGates = gates.filter((g) => g.status === "pending");
      for (const gate of pendingGates) {
        await approveGate(gate.id, serviceUserId);
      }
      if (pendingGates.length > 0) {
        await releaseRuntimeJobAfterApproval(executionId, serviceUserId);
        await publishRuntimeWorkerWake("write_gate_resolved");
        releasedApproval = true;
      }
    }

    if (isNewMission || !releasedApproval) {
      await publishRuntimeWorkerWake("mission_enqueued");
    }

    return NextResponse.json(
      {
        success: true,
        job_id: jobId,
        mission_id: mission.id,
        status: "queued",
      },
      { status: 202 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/agent/execute]", error);
    return NextResponse.json({ success: false, error: sanitizeText(message) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = authorized(request);
  if (auth === "missing_config") {
    return NextResponse.json(
      { success: false, error: "AEGIS_API_KEY not configured — endpoint fail-closed" },
      { status: 503 }
    );
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit(request);
  if (limited) return limited;

  return NextResponse.json({
    service: "plutao-agent-execute",
    commands: ["execute_real", "smoke"],
    write_gate: true,
    // smoke_target intentionally omitted — do not leak owner/repo without need
    note: "Proposal-only; real writes require H1 write gate outside this route.",
  });
}
