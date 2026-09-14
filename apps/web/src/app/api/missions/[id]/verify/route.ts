import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";
import { verifyDefinitionOfDone } from "@/lib/missions/dod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET/POST — roda verificação determinística da Definition of Done. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  return runVerify(ctx);
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  return runVerify(ctx);
}

async function runVerify(ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const mission = await getOwnedMission(id, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  const evidence = parseEvidence(mission.evidence);
  const result = verifyDefinitionOfDone({
    objective: String(mission.objective ?? ""),
    definitionOfDone: mission.definitionOfDone,
    evidence,
  });

  return NextResponse.json({
    missionId: mission.id,
    status: mission.status,
    ...result,
  });
}
