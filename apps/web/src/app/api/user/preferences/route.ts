import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users, usageCounters } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { getPlanDefinition } from "@plutao/domain";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        plan: users.plan,
        preferredModel: users.preferredModel,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const record = rows[0];
    const planDef = getPlanDefinition(record?.plan);

    const todayStr = new Date().toISOString().split("T")[0];
    const usageRows = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, user.id), eq(usageCounters.day, todayStr)))
      .limit(1);

    const usageRecord = usageRows[0] ?? { messages: 0, premiumMessages: 0 };

    return NextResponse.json({
      plan: record?.plan || "free",
      planDef,
      preferred_model: record?.preferredModel || null,
      usage: {
        day: todayStr,
        messages: usageRecord.messages,
        maxMessages: planDef.cloudMessagesPerDay,
        premiumMessages: usageRecord.premiumMessages,
        maxPremium: planDef.premiumPerDay,
      },
    });
  } catch (err) {
    console.error("[GET /api/user/preferences]", err);
    return NextResponse.json({ error: "Erro ao buscar preferências." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const preferredModel =
      typeof body.preferred_model === "string" && body.preferred_model.trim().length > 0
        ? body.preferred_model.trim()
        : null;

    const db = getDb();
    await db
      .update(users)
      .set({
        preferredModel,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      preferred_model: preferredModel,
    });
  } catch (err) {
    console.error("[POST /api/user/preferences]", err);
    return NextResponse.json({ error: "Erro ao salvar preferências." }, { status: 500 });
  }
}
