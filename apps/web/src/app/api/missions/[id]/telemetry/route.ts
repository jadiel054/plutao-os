import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auditEvents } from "@plutao/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission } from "@/lib/missions/ownership";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: missionId } = await ctx.params;
  if (!(await getOwnedMission(missionId, user.id))) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }
  const rows = await getDb()
    .select({ id: auditEvents.id, type: auditEvents.type, payload: auditEvents.payload, createdAt: auditEvents.createdAt })
    .from(auditEvents)
    .where(and(eq(auditEvents.userId, user.id), eq(auditEvents.type, "runtime.telemetry")))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);
  const events = rows.filter((row) => {
    const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
    return payload.missionId === missionId;
  });
  return NextResponse.json({ events });
}
