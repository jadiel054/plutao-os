import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { conversations, projects } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        title: conversations.title,
        isPinned: conversations.isPinned,
        projectId: conversations.projectId,
        projectName: projects.name,
        shareToken: conversations.shareToken,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .leftJoin(projects, eq(conversations.projectId, projects.id))
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.updatedAt));

    return NextResponse.json({ conversations: rows });
  } catch (err) {
    console.error("[GET /api/conversations]", err);
    return NextResponse.json({ error: "Erro ao buscar conversas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Nova conversa";
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;

    const db = getDb();
    const now = new Date();
    const inserted = await db
      .insert(conversations)
      .values({
        userId: user.id,
        title,
        projectId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ conversation: inserted[0] });
  } catch (err) {
    console.error("[POST /api/conversations]", err);
    return NextResponse.json({ error: "Erro ao criar conversa" }, { status: 500 });
  }
}
