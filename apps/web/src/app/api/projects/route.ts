import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects, users } from "@plutao/db";
import { eq, count } from "drizzle-orm";
import { getPlanDefinition } from "@plutao/domain";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, user.id));

    return NextResponse.json({ projects: userProjects });
  } catch (err) {
    console.error("[GET /api/projects]", err);
    return NextResponse.json({ error: "Erro ao buscar projetos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : null;

    if (!name) {
      return NextResponse.json({ error: "Nome do projeto é obrigatório." }, { status: 400 });
    }

    const db = getDb();

    // Fetch user plan and check projectsMax limit
    const userRows = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const planDef = getPlanDefinition(userRows[0]?.plan);

    if (planDef.projectsMax !== undefined && planDef.projectsMax !== null) {
      const [countResult] = await db
        .select({ total: count() })
        .from(projects)
        .where(eq(projects.userId, user.id));

      const totalProjects = Number(countResult?.total ?? 0);
      if (totalProjects >= planDef.projectsMax) {
        return NextResponse.json(
          {
            error: `Seu plano ${planDef.label} permite criar no máximo ${planDef.projectsMax} projeto(s). Conheça o plano Caronte para projetos ilimitados.`,
          },
          { status: 403 }
        );
      }
    }

    const [newProject] = await db
      .insert(projects)
      .values({
        userId: user.id,
        name,
        description,
      })
      .returning();

    return NextResponse.json({ project: newProject }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    return NextResponse.json({ error: "Erro ao criar projeto." }, { status: 500 });
  }
}
