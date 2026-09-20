import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { founderWaitlist } from "@plutao/db";
import { eq, sql } from "drizzle-orm";
import { getFounderTierForPosition } from "@plutao/domain";

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
      const pos = existing[0].position;
      const tier = getFounderTierForPosition(pos);
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        position: pos,
        priceMonthly: tier.priceMonthly,
        tierLabel: tier.label,
        message: `Você já está na lista de espera de fundador na posição #${pos}! Seu preço garantido é R$ ${tier.priceMonthly}/mês.`,
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

    const tier = getFounderTierForPosition(inserted.position);

    return NextResponse.json(
      {
        success: true,
        position: inserted.position,
        email: inserted.email,
        priceMonthly: tier.priceMonthly,
        tierLabel: tier.label,
        message: `Assento de fundador reservado com sucesso! Sua posição é #${inserted.position} — Preço garantido: R$ ${tier.priceMonthly}/mês travado por 12 meses.`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/founder/waitlist]", err);
    return NextResponse.json({ error: "Erro ao registrar na lista de espera." }, { status: 500 });
  }
}
