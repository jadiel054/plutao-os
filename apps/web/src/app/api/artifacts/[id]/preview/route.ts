import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_PREVIEW_CHARS = 200_000;

/**
 * Pre-visualizacao TEXTUAL de um artifact do proprio usuario (donor-checked).
 * Imagens e PDF usam /api/artifacts/[id]/content (binario privado); aqui
 * retornamos apenas conteudo textual armazenado no banco, truncado.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [row] = await getDb()
      .select({
        name: artifacts.name,
        type: artifacts.type,
        size: artifacts.size,
        content: artifacts.content,
      })
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Artifact não encontrado" }, { status: 404 });
    }

    if (row.type.startsWith("image/") || row.type === "application/pdf") {
      return NextResponse.json(
        { error: "Tipo não pré-visualizável como texto" },
        { status: 415 },
      );
    }

    const full = row.content || "";
    const text = full.slice(0, MAX_PREVIEW_CHARS);
    return NextResponse.json({
      name: row.name,
      type: row.type,
      size: row.size,
      truncated: full.length > MAX_PREVIEW_CHARS,
      text,
    });
  } catch (err) {
    console.error("[GET /api/artifacts/:id/preview]", err);
    return NextResponse.json({ error: "Erro ao carregar pré-visualização" }, { status: 500 });
  }
}
