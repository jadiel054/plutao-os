import { NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import {
  buildIntake,
  knowledgeFromIntake,
  probePolicyFromEnv,
  runProbes,
  type ProbeResult,
} from "@/lib/agentic/knowledge-intake";
import { recordExperience } from "@/lib/agentic/experience-store";
import { listLearnedKnowledge } from "@/lib/agentic/capability-snapshot";

export const dynamic = "force-dynamic";

/**
 * Aprendizado de ferramentas (API). GET: lista o conhecimento aprendido.
 * POST: intake de documentação — redação de segredos, parse do contrato,
 * probes GET somente em hosts da allowlist do SERVIDOR (env
 * PLUTAO_AGENTIC_PROBE_HOSTS) e persistência como conhecimento operacional
 * (hypothesis até probe bem-sucedido). Aprender NÃO concede autorização.
 */
export async function GET() {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const knowledge = await listLearnedKnowledge(user.id, 50);
  return NextResponse.json({
    available: true,
    count: knowledge.length,
    knowledge: knowledge.map((k) => ({
      subject: k.subject,
      kind: k.kind,
      method: k.method,
      observedAt: k.observedAt,
      limitations: k.limitations,
      usefulFor: k.usefulFor,
      requirements: k.requirements,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let body: { toolName?: string; documentationText?: string; baseUrl?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const toolName = (body.toolName ?? "").slice(0, 80);
  const documentationText = (body.documentationText ?? "").slice(0, 20000);
  const baseUrl = body.baseUrl ? String(body.baseUrl).slice(0, 500) : undefined;

  const intake = buildIntake({
    toolName,
    documentationText,
    baseUrl,
    policy: probePolicyFromEnv(process.env),
  });
  if (!intake.accepted) {
    return NextResponse.json({ accepted: false, reason: intake.reason }, { status: 400 });
  }

  let probeResults: ProbeResult[] = [];
  if (intake.probePlan.length > 0) {
    probeResults = await runProbes(intake.probePlan, async (url) => {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      return { ok: res.ok, text: await res.text() };
    });
  }

  const knowledge = knowledgeFromIntake(intake.doc, probeResults, new Date().toISOString());
  const stored = await recordExperience(user.id, knowledge);
  return NextResponse.json({
    accepted: true,
    sufficient: intake.sufficient,
    sufficiencyReason: intake.sufficiencyReason,
    probePlan: intake.probePlan,
    probeRefused: intake.probeRefused,
    probeResults,
    persisted: stored,
    knowledge: {
      subject: knowledge.subject,
      kind: knowledge.kind,
      limitations: knowledge.limitations,
      usefulFor: knowledge.usefulFor,
    },
  });
}
