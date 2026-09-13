import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { detectArtifactType, suggestArtifactName } from "@/lib/artifacts";
import { storageWrite } from "@/lib/runtime/tools/storage";

export const runtime = "nodejs";

const MAX_ARTIFACT_SIZE = 5 * 1024 * 1024; // 5MB max for V1

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content : "";

    if (!content.trim()) {
      return NextResponse.json({ error: "Conteúdo do artifact não pode ser vazio" }, { status: 400 });
    }

    const size = Buffer.byteLength(content, "utf-8");
    if (size > MAX_ARTIFACT_SIZE) {
      return NextResponse.json(
        { error: `Tamanho do artifact excede o limite permitido (máximo ${MAX_ARTIFACT_SIZE / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }

    const rawName = typeof body.name === "string" ? body.name : undefined;
    const name = suggestArtifactName(content, rawName);
    const typeInfo = detectArtifactType(name, content);
    const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : typeInfo.type;
    const missionId = typeof body.missionId === "string" ? body.missionId : null;
    const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

    const db = getDb();
    const [inserted] = await db
      .insert(artifacts)
      .values({
        userId: user.id,
        missionId,
        name,
        type,
        size,
        content,
        metadata,
      })
      .returning();

    // Sync to storage abstraction layer for runtime tool access
    try {
      await storageWrite(user.id, {
        path: `artifacts/${inserted.id}/${name}`,
        content,
      });
    } catch {
      /* ignore non-blocking storage sync error */
    }

    return NextResponse.json({
      artifact: {
        id: inserted.id,
        userId: inserted.userId,
        missionId: inserted.missionId,
        name: inserted.name,
        type: inserted.type,
        size: inserted.size,
        metadata: inserted.metadata,
        createdAt: inserted.createdAt,
        updatedAt: inserted.updatedAt,
      },
    });
  } catch (e) {
    console.error("[artifacts POST]", e);
    return NextResponse.json(
      { error: "Erro interno ao criar artifact" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: artifacts.id,
        userId: artifacts.userId,
        missionId: artifacts.missionId,
        name: artifacts.name,
        type: artifacts.type,
        size: artifacts.size,
        metadata: artifacts.metadata,
        createdAt: artifacts.createdAt,
        updatedAt: artifacts.updatedAt,
      })
      .from(artifacts)
      .where(eq(artifacts.userId, user.id))
      .orderBy(desc(artifacts.createdAt))
      .limit(50);

    return NextResponse.json({ artifacts: rows });
  } catch (e) {
    console.error("[artifacts GET]", e);
    return NextResponse.json(
      { error: "Erro interno ao listar artifacts" },
      { status: 500 }
    );
  }
}
