import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function publicMetadata(raw: unknown, artifactId: string) {
  const metadata = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  delete metadata.blobUrl;
  delete metadata.dataUrl;
  if (metadata.isImage === true) metadata.previewUrl = `/api/artifacts/${artifactId}/content`;
  return metadata;
}

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

    const row = rows[0];
    return NextResponse.json({
      artifact: {
        ...row,
        metadata: publicMetadata(row.metadata, row.id),
      },
    });
  } catch (e) {
    console.error("[artifacts/:id GET]", e);
    return NextResponse.json({ error: "Erro ao carregar artifact" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const db = getDb();
    const rows = await db
      .select({ id: artifacts.id, metadata: artifacts.metadata })
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id)))
      .limit(1);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "Artifact não encontrado" }, { status: 404 });

    const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    if (typeof metadata.blobUrl === "string" && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(metadata.blobUrl);
    }
    await db.delete(artifacts).where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id)));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[artifacts/:id DELETE]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Erro ao excluir artifact" }, { status: 500 });
  }
}
