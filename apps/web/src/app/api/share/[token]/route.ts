import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { missions, projects } from "@plutao/db";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  try {
    const db = getDb();
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
