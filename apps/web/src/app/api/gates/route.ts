import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listPendingGates } from "@/lib/connectors/gates";

export const runtime = "nodejs";

/** GET /api/gates — lista pending do usuário (opcional ?missionId=) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const missionId = req.nextUrl.searchParams.get("missionId");
  const gates = await listPendingGates(user.id, missionId);
  return NextResponse.json({
    gates: gates.map((g) => ({
      id: g.id,
      provider: g.provider,
      capability: g.capability,
      target: g.target,
      summary: g.summary,
      contentPreview: g.contentPreview,
      status: g.status,
      missionId: g.missionId,
      createdAt: g.createdAt,
    })),
  });
}
