import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getWriteGate,
  approveGate,
  markGateRejected,
  failUnconsumedGate,
  finalizeGateExecution,
} from "@/lib/connectors/gates";
import { runGithub } from "@/lib/runtime/tools/github";
import { runVercel } from "@/lib/runtime/tools/vercel";
import { runCloudflare } from "@/lib/runtime/tools/cloudflare";
import { runRender } from "@/lib/runtime/tools/render";
import { runSupabase } from "@/lib/runtime/tools/supabase";
import { runTelegram } from "@/lib/runtime/tools/telegram";
import { runArtemis } from "@/lib/runtime/tools/artemis";
import { runAutomationExecutor } from "@/lib/runtime/tools/automation";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { and, eq } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { sanitizeText } from "@/lib/security/sanitize";
import { getOwnedExecution } from "@/lib/runtime/service";
import { releaseRuntimeJobAfterApproval as releaseDurableRuntimeJob } from "@/lib/runtime/durableJobs";
import { MISSION_BATCH_CAPABILITY } from "@/lib/missions/missionApproval";
import { publishRuntimeWorkerWake } from "@/lib/runtime/workerQueue";
import { enqueueChatBuildJob, type ChatBuildPlan } from "@/lib/chat/buildJobs";

export const runtime = "nodejs";
/** Allow long autonomous cycles post-gate approval on Vercel Pro (Hobby caps lower). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const EVIDENCE_MAX = 2000;

async function releaseRuntimeJobAfterApproval(executionId: string, userId: string) {
  const released = await releaseDurableRuntimeJob(executionId, userId);
  if (released) await publishRuntimeWorkerWake("write_gate_resolved");
  return released;
}

async function appendEvidence(
  missionId: string | null | undefined,
  userId: string,
  content: string,
  type: "tool_result" | "tool_error" | "decision",
  executionId?: string | null,
  writeGateId?: string | null
) {
  if (!missionId) return;
  try {
    const db = getDb();
    const rows = await db
      .select({ evidence: missions.evidence })
      .from(missions)
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
      .limit(1);
    if (!rows[0]) return;
    const prev = parseEvidence(rows[0].evidence);
    const execution = executionId ? await getOwnedExecution(executionId, userId) : null;
    const checkpoint = execution?.checkpoint && typeof execution.checkpoint === "object"
      ? (execution.checkpoint as Record<string, unknown>)
      : {};
    const graphRuntime = checkpoint.missionGraphRuntime && typeof checkpoint.missionGraphRuntime === "object"
      ? (checkpoint.missionGraphRuntime as Record<string, unknown>)
      : {};
    const activeNodeId = typeof graphRuntime.activeNodeId === "string" ? graphRuntime.activeNodeId : null;
    const item: EvidenceItem = {
      id: crypto.randomUUID(),
      // H3 — nenhuma evidência recebe texto cru (tokens/segredos ficam de fora).
      content: sanitizeText(content).slice(0, EVIDENCE_MAX),
      type,
      source: "write_gate",
      taskId: null,
      missionId,
      executionId: executionId ?? undefined,
      metadata: activeNodeId || writeGateId
        ? { ...(activeNodeId ? { missionNodeId: activeNodeId, graphVersion: 2 } : {}), ...(writeGateId ? { writeGateId } : {}) }
        : undefined,
      createdAt: new Date().toISOString(),
    };
    await db
      .update(missions)
      .set({ evidence: [...prev, item], updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));
  } catch {
    /* non-fatal */
  }
}

type ProviderResult = { ok: true; output: string } | { ok: false; error: string };

async function executeApprovedGate(
  provider: string,
  execInput: string,
  userId: string,
  executionId?: string | null
): Promise<ProviderResult | null> {
  switch (provider) {
    case "github": {
      const r = await runGithub(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "vercel": {
      const r = await runVercel(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "cloudflare": {
      const r = await runCloudflare(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "render": {
      const r = await runRender(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "supabase": {
      const r = await runSupabase(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "telegram": {
      const r = await runTelegram(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "artemis": {
      const r = await runArtemis(execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "maestro":
    case "appium":
    case "playwright":
    case "androidworld": {
      const r = await runAutomationExecutor(provider as "maestro" | "appium" | "playwright" | "androidworld", execInput, userId, executionId ?? undefined);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    default:
      return null;
  }
}

/** POST /api/gates/[id] body: { decision: "approve" | "reject" } */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string };
  const decision = String(body.decision || "");

  const gate = await getWriteGate(id, user.id);
  if (!gate) return NextResponse.json({ error: "gate_not_found" }, { status: 404 });
  if (gate.status !== "pending") {
    return NextResponse.json({ error: "gate_not_pending", status: gate.status }, { status: 409 });
  }

  if (decision === "reject") {
    const updated = await markGateRejected(id, user.id);
    await appendEvidence(
      gate.missionId,
      user.id,
      `gate rejeitado: ${gate.provider}/${gate.capability} → ${gate.target}`,
      "decision",
      gate.executionId,
      gate.id
    );
    if (gate.executionId) await releaseRuntimeJobAfterApproval(gate.executionId, user.id);
    return NextResponse.json({ ok: true, status: "rejected", gate: updated });
  }

  if (decision !== "approve") {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  }

  // Aprovação única em lote: não há provider a executar; o gate aprovado é
  // finalizado imediatamente e libera a missão inteira de uma vez.
  if (gate.capability === MISSION_BATCH_CAPABILITY) {
    const approved = await approveGate(id, user.id);
    if (!approved) {
      return NextResponse.json({ error: "gate_not_pending", status: gate.status }, { status: 409 });
    }
    await finalizeGateExecution(id, user.id, {
      ok: true,
      output: "Plano da missão autorizado de ponta a ponta.",
    });
    await appendEvidence(
      gate.missionId,
      user.id,
      "plano da missão aprovado (autorização única em lote)",
      "decision",
      gate.executionId,
      gate.id
    );
    if (gate.executionId) {
      await releaseRuntimeJobAfterApproval(gate.executionId, user.id);
    } else if (gate.missionId) {
      try {
        await runAutonomousMissionServer({ missionId: gate.missionId, userId: user.id });
      } catch (e) {
        console.error(
          "[api/gates/[id]/route] erro ao retomar missão após autorização em lote:",
          sanitizeText(e instanceof Error ? e.message : String(e))
        );
      }
    }
    return NextResponse.json({ ok: true, status: "executed", output: "Plano da missão autorizado." });
  }

  // Aprovação inicial da CRIAÇÃO NO CHAT (provider "chat_build"). Não há
  // provider externo a executar: o gate aprovado é finalizado e a execução
  // durável do plano é enfileirada (job kind "chat_build", missionId null),
  // com wake do worker. Idempotente: build ativo existente não é duplicado.
  if (gate.provider === "chat_build" && gate.capability === "build_plan") {
    const approvedPlan = await approveGate(id, user.id);
    if (!approvedPlan) {
      return NextResponse.json({ error: "gate_not_pending", status: gate.status }, { status: 409 });
    }
    await finalizeGateExecution(id, user.id, {
      ok: true,
      output: "Plano de criação autorizado. Execução durável iniciada.",
    });
    const planPayload = (gate.payload || {}) as {
      conversationId?: string;
      plan?: ChatBuildPlan;
      userText?: string;
    };
    const planConversationId =
      typeof planPayload.conversationId === "string" && planPayload.conversationId
        ? planPayload.conversationId
        : gate.target;
    try {
      const enqueued = await enqueueChatBuildJob({
        userId: user.id,
        conversationId: planConversationId,
        gateId: gate.id,
        plan: planPayload.plan ?? null,
        userText: planPayload.userText ?? "",
      });
      await publishRuntimeWorkerWake("mission_enqueued", { delaySeconds: 0 });
      return NextResponse.json({
        ok: true,
        status: "executed",
        output: "Plano de criação autorizado. Execução durável iniciada em segundo plano.",
        jobId: enqueued.job.id,
      });
    } catch (e) {
      const message = sanitizeText(e instanceof Error ? e.message : String(e));
      await failUnconsumedGate(id, user.id, "falha ao enfileirar a execução durável do plano de criação");
      return NextResponse.json({ ok: false, status: "failed", error: message }, { status: 502 });
    }
  }

  const provider = String(gate.provider || "");
  const capability = String(gate.capability || "");

  // H1 — aprovação humana: `pending` → `approved` (grava payload_hash).
  const approved = await approveGate(id, user.id);
  if (!approved) {
    return NextResponse.json({ error: "gate_not_pending", status: gate.status }, { status: 409 });
  }

  // H1 — o input de execução é reconstruído a partir do payload PERSISTIDO
  // (o mesmo que o humano viu). NÃO existe mais `_gateApproved`: o único
  // caminho de autorização é o `_gateId`, validado no servidor contra o hash.
  const payload = (gate.payload || {}) as Record<string, unknown>;
  const execInput = JSON.stringify({
    ...payload,
    action: capability,
    _gateId: gate.id,
    missionId: gate.missionId,
  });

  const result = await executeApprovedGate(provider, execInput, user.id, gate.executionId);
  if (!result) {
    const error = `provider não suportado: ${provider}`;
    await failUnconsumedGate(id, user.id, error);
    await appendEvidence(gate.missionId, user.id, `gate falhou: ${error}`, "tool_error", gate.executionId, gate.id);
    if (gate.executionId) await releaseRuntimeJobAfterApproval(gate.executionId, user.id);
    return NextResponse.json({ error: `provider_not_supported: ${provider}` }, { status: 400 });
  }

  // Rede de segurança: se o executor não consumiu o gate (ex.: capability não
  // classificada como escrita), ele não pode ficar preso em `approved`.
  const after = await getWriteGate(id, user.id);
  if (after && after.status === "approved") {
    const error = "execução não consumiu o gate — operação recusada por segurança";
    await failUnconsumedGate(
      id,
      user.id,
      error
    );
    await appendEvidence(gate.missionId, user.id, `gate falhou: ${error}`, "tool_error", gate.executionId, gate.id);
    if (gate.executionId) await releaseRuntimeJobAfterApproval(gate.executionId, user.id);
    return NextResponse.json({ error, status: "failed" }, { status: 502 });
  }

  if (!result.ok) {
    await appendEvidence(
      gate.missionId,
      user.id,
      `gate aprovado mas falhou: ${provider}/${capability} → ${result.error}`,
      "tool_error",
      gate.executionId,
      gate.id
    );
    if (gate.executionId) await releaseRuntimeJobAfterApproval(gate.executionId, user.id);
    return NextResponse.json(
      { ok: false, status: "failed", error: sanitizeText(result.error) },
      { status: 502 }
    );
  }

  await appendEvidence(
    gate.missionId,
    user.id,
    `gate aprovado e executado: ${provider}/${capability}\n${result.output}`,
    "tool_result",
    gate.executionId,
    gate.id
  );

  const releasedJob = gate.executionId
    ? await releaseRuntimeJobAfterApproval(gate.executionId, user.id)
    : null;
  if (gate.missionId && !gate.executionId) {
    if (!releasedJob) {
      try {
        await runAutonomousMissionServer({ missionId: gate.missionId, userId: user.id });
      } catch (e) {
        console.error(
          "[api/gates/[id]/route] Error resuming legacy mission after gate approval:",
          sanitizeText(e instanceof Error ? e.message : String(e))
        );
      }
    }
  }

  return NextResponse.json({ ok: true, status: "executed", output: result.output, resumed: Boolean(releasedJob) });
}
