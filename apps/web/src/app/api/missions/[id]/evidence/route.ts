import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** List all evidence items for a mission (owner only). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const mission = await getOwnedMission(id, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  const evidence = parseEvidence(mission.evidence);
  return NextResponse.json({ evidence });
}
