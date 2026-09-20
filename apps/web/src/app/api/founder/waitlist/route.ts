import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { founderWaitlist } from "@plutao/db";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const db = getDb();

    // Check if already registered
    const existing = await db
      .select({ position: founderWaitlist.position })
      .from(founderWaitlist)
      .where(eq(founderWaitlist.email, email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        position: existing[0].position,
        message: `Você já está na lista de espera de fundador na posição #${existing[0].position}!`,
      });
    }

    // Get next position sequentially
    const [maxPosResult] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${founderWaitlist.position}), 0)` })
      .from(founderWaitlist);

    const nextPosition = (Number(maxPosResult?.maxPos) || 0) + 1;

    const [inserted] = await db
      .insert(founderWaitlist)
      .values({
        email,
        position: nextPosition,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        position: inserted.position,
        email: inserted.email,
        message: `Assento de fundador reservado com sucesso! Sua posição é #${inserted.position}.`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/founder/waitlist]", err);
    return NextResponse.json({ error: "Erro ao registrar na lista de espera." }, { status: 500 });
  }
}
