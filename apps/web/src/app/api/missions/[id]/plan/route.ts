import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import {
  applyStepTransition,
  createPlanFromTitles,
  parseMissionPlan,
  type MissionPlanV1,
  type MissionStepStatus,
  type ProjectBrief,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwnedPlan(missionId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: missions.id,
      objective: missions.objective,
      plan: missions.plan,
      status: missions.status,
    })
    .from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function savePlan(
  missionId: string,
  userId: string,
  plan: MissionPlanV1,
  missionStatus?: string
) {
  const db = getDb();
  const completedSteps = plan.steps
    .filter((s) => s.status === "PASSED")
    .map((s) => s.title);
  const pendingSteps = plan.steps
    .filter((s) => s.status !== "PASSED" && s.status !== "CANCELLED")
    .map((s) => s.title);

  const patch: Record<string, unknown> = {
    plan,
    completedSteps,
    pendingSteps,
    updatedAt: new Date(),
  };
  if (missionStatus) {
    patch.status = missionStatus;
    patch.currentState = missionStatus;
  }

  const updated = await db
    .update(missions)
    .set(patch)
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
    .returning({
      id: missions.id,
      objective: missions.objective,
      plan: missions.plan,
      status: missions.status,
      completedSteps: missions.completedSteps,
      pendingSteps: missions.pendingSteps,
      updatedAt: missions.updatedAt,
    });
  return updated[0];
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const row = await loadOwnedPlan(id, user.id);
    if (!row) {
      return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
    }
    const plan = parseMissionPlan(row.plan);
    return NextResponse.json({
      missionId: row.id,
      objective: row.objective,
      status: row.status,
      plan,
    });
  } catch (e) {
    console.error("[missions/:id/plan GET]", e);
    return NextResponse.json({ error: "Falha ao carregar plano" }, { status: 500 });
  }
}

/**
 * Actions:
 * - create_plan: { stepTitles: string[], brief?: ProjectBrief }
 * - align: {}
 * - transition: { stepId, toStatus, failureCause?, eventLabel?, eventDetail? }
 * - append_event: { kind, label, detail?, stepId? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const row = await loadOwnedPlan(id, user.id);
    if (!row) {
      return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
    }

    if (action === "create_plan") {
      const titles = Array.isArray(body.stepTitles)
        ? body.stepTitles
            .map((t: unknown) => String(t ?? "").trim())
            .filter((t: string) => t.length > 0)
        : [];
      if (titles.length === 0) {
        return NextResponse.json(
          { error: "Informe ao menos um passo (stepTitles)" },
          { status: 400 }
        );
      }
      const brief =
        body.brief && typeof body.brief === "object"
          ? (body.brief as ProjectBrief)
          : {
              objective: String(row.objective ?? ""),
            };
      const plan = createPlanFromTitles(titles, brief);
      const saved = await savePlan(id, user.id, plan, "PLANNING");
      return NextResponse.json({ mission: saved, plan });
    }

    let plan = parseMissionPlan(row.plan);
    if (!plan) {
      return NextResponse.json(
        { error: "Plano inexistente. Use action create_plan primeiro." },
        { status: 409 }
      );
    }

    if (action === "align") {
      if (plan.steps.length === 0) {
        return NextResponse.json(
          { error: "Não há passos para alinhar" },
          { status: 409 }
        );
      }
      const now = new Date().toISOString();
      plan = {
        ...plan,
        aligned: true,
        updatedAt: now,
        events: [
          ...plan.events,
          {
            id: crypto.randomUUID(),
            kind: "aligned",
            label: "Plano alinhado com o usuário",
            detail: "Execução liberada",
            at: now,
          },
        ],
      };
      const saved = await savePlan(id, user.id, plan, "EXECUTING");
      return NextResponse.json({ mission: saved, plan });
    }

    if (action === "transition") {
      const stepId = String(body.stepId ?? "");
      const toStatus = String(body.toStatus ?? "") as MissionStepStatus;
      if (!stepId || !toStatus) {
        return NextResponse.json(
          { error: "stepId e toStatus são obrigatórios" },
          { status: 400 }
        );
      }
      if (!plan.aligned && toStatus === "RUNNING") {
        return NextResponse.json(
          { error: "Alinhe o plano antes de executar passos" },
          { status: 409 }
        );
      }
      const next = applyStepTransition(plan, stepId, toStatus, {
        failureCause:
          typeof body.failureCause === "string" ? body.failureCause : null,
        eventLabel:
          typeof body.eventLabel === "string" ? body.eventLabel : undefined,
        eventDetail:
          typeof body.eventDetail === "string" ? body.eventDetail : undefined,
      });
      if (!next) {
        return NextResponse.json(
          {
            error: "Transição de passo não permitida",
            message:
              "Falha bloqueia avanço. Ciclo obrigatório: Falha → Inspecionar → Corrigir → Testar → Passed.",
          },
          { status: 409 }
        );
      }
      const allPassed =
        next.steps.length > 0 &&
        next.steps.every(
          (s) => s.status === "PASSED" || s.status === "CANCELLED"
        );
      const saved = await savePlan(
        id,
        user.id,
        next,
        allPassed ? "VERIFYING" : undefined
      );
      return NextResponse.json({ mission: saved, plan: next });
    }

    if (action === "append_event") {
      const kind = String(body.kind ?? "note");
      const label = String(body.label ?? "").trim();
      if (!label) {
        return NextResponse.json({ error: "label obrigatório" }, { status: 400 });
      }
      const now = new Date().toISOString();
      plan = {
        ...plan,
        updatedAt: now,
        events: [
          ...plan.events,
          {
            id: crypto.randomUUID(),
            kind: kind as MissionPlanV1["events"][number]["kind"],
            label,
            detail:
              typeof body.detail === "string" ? body.detail : null,
            stepId:
              typeof body.stepId === "string" ? body.stepId : null,
            at: now,
          },
        ],
      };
      const saved = await savePlan(id, user.id, plan);
      return NextResponse.json({ mission: saved, plan });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
  } catch (e) {
    console.error("[missions/:id/plan PATCH]", e);
    return NextResponse.json({ error: "Falha ao atualizar plano" }, { status: 500 });
  }
}
