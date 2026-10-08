import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { missions } from "@plutao/db";
import {
  applyStepTransition,
  createPlanFromTitles,
  missionPlanV1ToGraphV2,
  parseMissionPlan,
  validateMissionGraphV2,
  type MissionPlanV1,
  type MissionStepStatus,
  type ProjectBrief,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import {
  listMissionSpecialistProfileOptions,
  resolveSpecialistPolicy,
} from "@/lib/missions/specialistProfiles";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwnedPlan(missionId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: missions.id,
      objective: missions.objective,
      plan: missions.plan,
      missionGraph: missions.missionGraph,
      graphVersion: missions.graphVersion,
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
  missionStatus?: string,
  graph?: ReturnType<typeof missionPlanV1ToGraphV2>,
  options: { requireUnaligned?: boolean; expectedGraph?: unknown } = {}
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
  if (graph) {
    patch.graphVersion = graph.version;
    patch.missionGraph = graph;
  }

  const conditions = [eq(missions.id, missionId), eq(missions.userId, userId)];
  if (options.requireUnaligned) {
    conditions.push(
      inArray(missions.status, ["CREATED", "UNDERSTANDING", "PLANNING"]),
      sql`COALESCE(${missions.plan}->>'aligned', 'false') <> 'true'`
    );
  }
  if (Object.prototype.hasOwnProperty.call(options, "expectedGraph")) {
    conditions.push(
      options.expectedGraph === null
        ? isNull(missions.missionGraph)
        : sql`${missions.missionGraph} = ${JSON.stringify(options.expectedGraph)}::jsonb`
    );
  }

  const updated = await db
    .update(missions)
    .set(patch)
    .where(and(...conditions))
    .returning({
      id: missions.id,
      objective: missions.objective,
      plan: missions.plan,
      missionGraph: missions.missionGraph,
      graphVersion: missions.graphVersion,
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
      graphVersion: row.graphVersion,
      graph: row.missionGraph,
      specialistProfiles: listMissionSpecialistProfileOptions(),
    });
  } catch (e) {
    console.error("[missions/:id/plan GET]", e);
    return NextResponse.json({ error: "Falha ao carregar plano" }, { status: 500 });
  }
}

/**
 * Actions:
 * - create_plan: { stepTitles: string[], brief?: ProjectBrief }
 * - assign_specialist: { nodeId, specialistProfileId, requiredCapabilities? } — somente antes do alinhamento
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
      const currentPlan = parseMissionPlan(row.plan);
      if (
        currentPlan?.aligned ||
        ["EXECUTING", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED"].includes(
          String(row.status).toUpperCase()
        )
      ) {
        return NextResponse.json(
          {
            error: "MISSION_GRAPH_IMMUTABLE",
            message: "O grafo não pode ser alterado após o alinhamento ou início da execução.",
          },
          { status: 409 }
        );
      }
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
      const graph = missionPlanV1ToGraphV2(plan);
      const validation = validateMissionGraphV2(graph);
      if (!validation.ok) {
        return NextResponse.json(
          { error: "MISSION_GRAPH_INVALID", issues: validation.issues },
          { status: 422 }
        );
      }
      const saved = await savePlan(id, user.id, plan, "PLANNING", graph, {
        requireUnaligned: true,
        expectedGraph: row.missionGraph ?? null,
      });
      if (!saved) {
        return NextResponse.json({ error: "MISSION_GRAPH_CHANGED_RETRY" }, { status: 409 });
      }
      return NextResponse.json({ mission: saved, plan, graph });
    }

    if (action === "assign_specialist") {
      const currentPlan = parseMissionPlan(row.plan);
      if (
        !currentPlan ||
        currentPlan.aligned ||
        ["EXECUTING", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED"].includes(
          String(row.status).toUpperCase()
        )
      ) {
        return NextResponse.json(
          {
            error: "MISSION_GRAPH_IMMUTABLE",
            message: "A atribuição de perfil só pode mudar antes do alinhamento da missão.",
          },
          { status: 409 }
        );
      }

      const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
      const rawProfileId = body.specialistProfileId;
      const specialistProfileId =
        rawProfileId === null || (typeof rawProfileId === "string" && rawProfileId.trim() === "")
          ? null
          : typeof rawProfileId === "string"
            ? rawProfileId.trim()
            : undefined;
      if (!nodeId || specialistProfileId === undefined) {
        return NextResponse.json(
          { error: "SPECIALIST_ASSIGNMENT_INVALID" },
          { status: 400 }
        );
      }

      const currentGraph = row.missionGraph ?? missionPlanV1ToGraphV2(currentPlan);
      const currentValidation = validateMissionGraphV2(currentGraph);
      if (!currentValidation.ok) {
        return NextResponse.json({ error: "MISSION_GRAPH_INVALID" }, { status: 409 });
      }
      const targetNode = currentValidation.graph.nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return NextResponse.json({ error: "MISSION_GRAPH_NODE_NOT_FOUND" }, { status: 404 });
      }

      const requiredCapabilities =
        body.requiredCapabilities === undefined
          ? targetNode.requiredCapabilities
          : body.requiredCapabilities;
      if (
        !Array.isArray(requiredCapabilities) ||
        !requiredCapabilities.every((capability: unknown) => typeof capability === "string")
      ) {
        return NextResponse.json({ error: "SPECIALIST_CAPABILITIES_INVALID" }, { status: 400 });
      }
      const policy = resolveSpecialistPolicy(specialistProfileId, requiredCapabilities as string[]);
      if (!policy.ok) {
        return NextResponse.json(
          { error: "MISSION_GRAPH_SPECIALIST_POLICY_INVALID", reason: policy.reason },
          { status: 422 }
        );
      }

      const graph = {
        ...currentValidation.graph,
        nodes: currentValidation.graph.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, specialistProfileId, requiredCapabilities: requiredCapabilities as string[] }
            : node
        ),
      };
      const graphValidation = validateMissionGraphV2(graph);
      if (!graphValidation.ok) {
        return NextResponse.json(
          { error: "MISSION_GRAPH_INVALID", issues: graphValidation.issues },
          { status: 422 }
        );
      }
      const saved = await savePlan(id, user.id, currentPlan, undefined, graphValidation.graph, {
        requireUnaligned: true,
        expectedGraph: row.missionGraph ?? null,
      });
      if (!saved) {
        return NextResponse.json({ error: "MISSION_GRAPH_CHANGED_RETRY" }, { status: 409 });
      }
      return NextResponse.json({ mission: saved, plan: currentPlan, graph: graphValidation.graph });
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
      const graphCandidate = row.missionGraph ?? missionPlanV1ToGraphV2(plan);
      const graphValidation = validateMissionGraphV2(graphCandidate);
      if (!graphValidation.ok) {
        return NextResponse.json(
          { error: "MISSION_GRAPH_INVALID", issues: graphValidation.issues },
          { status: 409 }
        );
      }
      const invalidSpecialistNode = graphValidation.graph.nodes.find(
        (node) => !resolveSpecialistPolicy(node.specialistProfileId, node.requiredCapabilities).ok
      );
      if (invalidSpecialistNode) {
        return NextResponse.json(
          {
            error: "MISSION_GRAPH_SPECIALIST_POLICY_INVALID",
            nodeId: invalidSpecialistNode.id,
          },
          { status: 409 }
        );
      }
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
      const saved = await savePlan(id, user.id, plan, "EXECUTING", graphValidation.graph, {
        requireUnaligned: true,
        expectedGraph: row.missionGraph ?? null,
      });
      if (!saved) {
        return NextResponse.json({ error: "MISSION_GRAPH_CHANGED_RETRY" }, { status: 409 });
      }
      return NextResponse.json({ mission: saved, plan, graph: graphValidation.graph });
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
