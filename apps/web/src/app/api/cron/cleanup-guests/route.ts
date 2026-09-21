import { NextRequest, NextResponse } from "next/server";
import { lt, and, isNull, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { guestSessions, users, missions, artifacts } from "@plutao/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.SESSION_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 dias atrás

    const expiredGuests = await db
      .select({ id: guestSessions.id, userId: guestSessions.userId })
      .from(guestSessions)
      .where(and(lt(guestSessions.createdAt, cutoff), isNull(guestSessions.convertedUserId)));

    if (expiredGuests.length === 0) {
      return NextResponse.json({ success: true, purgedSessions: 0, purgedUsers: 0 });
    }

    const userIds = [...new Set(expiredGuests.map((g) => g.userId))];

    if (userIds.length > 0) {
      await db.delete(missions).where(inArray(missions.userId, userIds));
      await db.delete(artifacts).where(inArray(artifacts.userId, userIds));
      await db.delete(guestSessions).where(inArray(guestSessions.userId, userIds));
      await db.delete(users).where(and(inArray(users.id, userIds), eq(users.isGuest, true)));
    }

    return NextResponse.json({
      success: true,
      purgedSessions: expiredGuests.length,
      purgedUsers: userIds.length,
    });
  } catch (err) {
    console.error("[cron/cleanup-guests]", err);
    return NextResponse.json({ error: "Erro na limpeza de convidados" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
