import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getWriteGate,
  markGateApproved,
  markGateRejected,
} from "@/lib/connectors/gates";
import { runGithub } from "@/lib/runtime/tools/github";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { and, eq } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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
      type,
      content,
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
      `gate rejeitado: ${gate.capability} → ${gate.target}`,
      "decision"
    );
    return NextResponse.json({ ok: true, status: "rejected", gate: updated });
  }

  if (decision !== "approve") {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  }

  const payload = (gate.payload || {}) as Record<string, unknown>;
  const execInput = JSON.stringify({
    ...payload,
    action: gate.capability,
    _gateApproved: true,
    _gateId: gate.id,
    missionId: gate.missionId,
  });

  const result = await runGithub(execInput, user.id);

  if (!result.ok) {
    await markGateApproved(id, user.id, null, result.error || "execução falhou");
    await appendEvidence(
      gate.missionId,
      user.id,
      `gate aprovado mas falhou: ${gate.capability} → ${result.error}`,
      "tool_error"
    );
    return NextResponse.json({ ok: false, status: "failed", error: result.error }, { status: 502 });
  }

  await markGateApproved(id, user.id, { output: result.output });
  await appendEvidence(
    gate.missionId,
    user.id,
    `gate aprovado e executado: ${gate.capability}\n${result.output}`,
    "tool_result"
  );

  return NextResponse.json({ ok: true, status: "executed", output: result.output });
}
