import { NextRequest, NextResponse } from "next/server";
import { riskAcceptances } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para registrar esta escolha." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const modelRef = typeof body.model_ref === "string" ? body.model_ref.trim() : "";
  const reasonShown = typeof body.reason_shown === "string" ? body.reason_shown.trim() : "";
  if (!modelRef || modelRef.length > 300 || !reasonShown || reasonShown.length > 2_000) {
    return NextResponse.json({ error: "model_ref e reason_shown são obrigatórios e têm limite de tamanho." }, { status: 400 });
  }
  try {
    const db = getDb();
    const inserted = await db.insert(riskAcceptances).values({
      userId: user.id,
      modelRef,
      reasonShown,
      createdAt: new Date(),
    }).returning({ id: riskAcceptances.id, createdAt: riskAcceptances.createdAt });
    return NextResponse.json({ accepted: true, acceptance: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/models/risk-acceptance]", error);
    return NextResponse.json({ error: "Registro de risco indisponível. Tente novamente depois da migration." }, { status: 503 });
  }
}
