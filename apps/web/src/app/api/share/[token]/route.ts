import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { conversations, messages, missions, projects } from "@plutao/db";
import { getDb } from "@/lib/db";
import { sanitizeText } from "@/lib/security/sanitize";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  try {
    const db = getDb();

    // Conversation shares are prefixed and must never fall through to the
    // mission share domain. The snapshot intentionally excludes metadata,
    // artifacts, traces and ownership identifiers.
    if (token.startsWith("conv_")) {
      const conversationRows = await db
        .select({
          id: conversations.id,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          projectId: conversations.projectId,
        })
        .from(conversations)
        .where(eq(conversations.shareToken, token))
        .limit(1);

      const conversation = conversationRows[0];
      if (!conversation) {
        return NextResponse.json({ error: "Link de compartilhamento não encontrado ou desativado" }, { status: 404 });
      }

      const messageRows = await db
        .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id), inArray(messages.role, ["user", "assistant"])))
        .orderBy(messages.createdAt);

      let projectName: string | null = null;
      if (conversation.projectId) {
        const proj = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, conversation.projectId))
          .limit(1);
        if (proj[0]) projectName = proj[0].name;
      }

      return NextResponse.json({
        shared: true,
        kind: "conversation",
        conversation: {
          id: conversation.id,
          title: sanitizeText(conversation.title),
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          projectName,
          messages: messageRows.map((message) => ({
            id: message.id,
            role: message.role,
            content: sanitizeText(message.content),
            createdAt: message.createdAt,
          })),
        },
      });
    }

    // Keep legacy mission links isolated from conversation shares.
    const rows = await db
      .select({
        id: missions.id,
        objective: missions.objective,
        status: missions.status,
        currentState: missions.currentState,
        definitionOfDone: missions.definitionOfDone,
        plan: missions.plan,
        completedSteps: missions.completedSteps,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
        projectId: missions.projectId,
      })
      .from(missions)
      .where(eq(missions.shareToken, token))
      .limit(1);

    const mission = rows[0];
    if (!mission) {
      return NextResponse.json({ error: "Link de compartilhamento não encontrado ou desativado" }, { status: 404 });
    }

    let projectName: string | null = null;
    if (mission.projectId) {
      const proj = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, mission.projectId))
        .limit(1);
      if (proj[0]) projectName = proj[0].name;
    }

    return NextResponse.json({
      shared: true,
      mission: {
        id: mission.id,
        objective: mission.objective,
        status: mission.status,
        definitionOfDone: mission.definitionOfDone,
        plan: mission.plan,
        completedSteps: mission.completedSteps,
        createdAt: mission.createdAt,
        updatedAt: mission.updatedAt,
        projectName,
      },
    });
  } catch (e) {
    console.error("[api/share/:token GET]", e);
    return NextResponse.json({ error: "Erro ao carregar conversa compartilhada" }, { status: 500 });
  }
}
