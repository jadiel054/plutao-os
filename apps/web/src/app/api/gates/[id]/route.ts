import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getWriteGate,
  approveGate,
  markGateRejected,
  failUnconsumedGate,
} from "@/lib/connectors/gates";
import { runGithub } from "@/lib/runtime/tools/github";
import { runVercel } from "@/lib/runtime/tools/vercel";
import { runCloudflare } from "@/lib/runtime/tools/cloudflare";
import { runRender } from "@/lib/runtime/tools/render";
import { runSupabase } from "@/lib/runtime/tools/supabase";
import { runTelegram } from "@/lib/runtime/tools/telegram";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { and, eq } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { sanitizeText } from "@/lib/security/sanitize";

export const runtime = "nodejs";
/** Allow long autonomous cycles post-gate approval on Vercel Pro (Hobby caps lower). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const EVIDENCE_MAX = 2000;

async function appendEvidence(
  missionId: string | null | undefined,
  userId: string,
  content: string,
  type: "tool_result" | "tool_error" | "decision"
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
    const item: EvidenceItem = {
      id: crypto.randomUUID(),
      // H3 — nenhuma evidência recebe texto cru (tokens/segredos ficam de fora).
      content: sanitizeText(content).slice(0, EVIDENCE_MAX),
      type,
      source: "write_gate",
      taskId: null,
      missionId,
      createdAt: new Date().toISOString(),
    };
    await db
      .update(missions)
      .set({ evidence: [...prev, item], updatedAt: new Date() })
      .where(eq(missions.id, missionId));
  } catch {
    /* non-fatal */
  }
}

type ProviderResult = { ok: true; output: string } | { ok: false; error: string };

async function executeApprovedGate(
  provider: string,
  execInput: string,
  userId: string
): Promise<ProviderResult | null> {
  switch (provider) {
    case "github": {
      const r = await runGithub(execInput, userId);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "vercel": {
      const r = await runVercel(execInput, userId);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "cloudflare": {
      const r = await runCloudflare(execInput, userId);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "render": {
      const r = await runRender(execInput, userId);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "supabase": {
      const r = await runSupabase(execInput, userId);
      return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error };
    }
    case "telegram": {
      const r = await runTelegram(execInput, userId);
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
      "decision"
    );
    return NextResponse.json({ ok: true, status: "rejected", gate: updated });
  }

  if (decision !== "approve") {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
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

  const result = await executeApprovedGate(provider, execInput, user.id);
  if (!result) {
    await failUnconsumedGate(id, user.id, `provider não suportado: ${provider}`);
    return NextResponse.json({ error: `provider_not_supported: ${provider}` }, { status: 400 });
  }

  // Rede de segurança: se o executor não consumiu o gate (ex.: capability não
  // classificada como escrita), ele não pode ficar preso em `approved`.
  const after = await getWriteGate(id, user.id);
  if (after && after.status === "approved") {
    await failUnconsumedGate(
      id,
      user.id,
      "execução não consumiu o gate — operação recusada por segurança"
    );
  }

  if (!result.ok) {
    await appendEvidence(
      gate.missionId,
      user.id,
      `gate aprovado mas falhou: ${provider}/${capability} → ${result.error}`,
      "tool_error"
    );
    return NextResponse.json(
      { ok: false, status: "failed", error: sanitizeText(result.error) },
      { status: 502 }
    );
  }

  await appendEvidence(
    gate.missionId,
    user.id,
    `gate aprovado e executado: ${provider}/${capability}\n${result.output}`,
    "tool_result"
  );

  if (gate.missionId) {
    try {
      await runAutonomousMissionServer({
        missionId: gate.missionId,
        userId: user.id,
      });
    } catch (e) {
      console.error(
        "[api/gates/[id]/route] Error resuming mission after gate approval:",
        sanitizeText(e instanceof Error ? e.message : String(e))
      );
    }
  }

  return NextResponse.json({ ok: true, status: "executed", output: result.output });
}
