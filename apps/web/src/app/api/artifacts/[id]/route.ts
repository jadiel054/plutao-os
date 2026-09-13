import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID de artifact inválido" }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id)))
      .limit(1);

    const artifact = rows[0];
    if (!artifact) {
      return NextResponse.json({ error: "Artifact não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ artifact });
  } catch (e) {
    console.error("[artifacts/[id] GET]", e);
    return NextResponse.json(
      { error: "Erro interno ao buscar artifact" },
      { status: 500 }
    );
  }
}
