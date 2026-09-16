import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id)))
      .limit(1);

    if (!rows[0]) {
      return NextResponse.json({ error: "Artifact não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ artifact: rows[0] });
  } catch (e) {
    console.error("[artifacts/:id GET]", e);
    return NextResponse.json({ error: "Erro ao carregar artifact" }, { status: 500 });
  }
}
