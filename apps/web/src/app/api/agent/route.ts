import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { agents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Get or create the user's primary agent profile. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        identity: agents.identity,
        personality: agents.personality,
        updatedAt: agents.updatedAt,
      })
      .from(agents)
      .where(eq(agents.userId, user.id))
      .limit(1);

    if (rows[0]) {
      return NextResponse.json({ agent: rows[0] });
    }

    const now = new Date();
    const inserted = await db
      .insert(agents)
      .values({
        userId: user.id,
        name: "Plutão",
        identity: "Assistente pessoal autônomo do usuário",
        personality: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: agents.id,
        name: agents.name,
        identity: agents.identity,
        personality: agents.personality,
        updatedAt: agents.updatedAt,
      });

    return NextResponse.json({ agent: inserted[0] }, { status: 201 });
  } catch (e) {
    console.error("[agent GET]", e);
    return NextResponse.json({ error: "Falha ao carregar agente" }, { status: 500 });
  }
}

/** Update primary agent profile (name / identity / personality). */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const body = await req.json();
    const name = body.name != null ? String(body.name).trim() : null;
    const identity = body.identity != null ? String(body.identity).trim() : null;
    const personality = body.personality != null ? String(body.personality).trim() : null;

    if (name !== null && name.length < 1) {
      return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.userId, user.id))
      .limit(1);

    const now = new Date();

    if (!existing[0]) {
      const inserted = await db
        .insert(agents)
        .values({
          userId: user.id,
          name: name || "Plutão",
          identity: identity,
          personality: personality,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: agents.id,
          name: agents.name,
          identity: agents.identity,
          personality: agents.personality,
          updatedAt: agents.updatedAt,
        });
      return NextResponse.json({ agent: inserted[0] }, { status: 201 });
    }

    const patch: {
      name?: string;
      identity?: string | null;
      personality?: string | null;
      updatedAt: Date;
    } = { updatedAt: now };
    if (name !== null) patch.name = name;
    if (identity !== null) patch.identity = identity || null;
    if (personality !== null) patch.personality = personality || null;

    const updated = await db
      .update(agents)
      .set(patch)
      .where(eq(agents.id, existing[0].id))
      .returning({
        id: agents.id,
        name: agents.name,
        identity: agents.identity,
        personality: agents.personality,
        updatedAt: agents.updatedAt,
      });

    return NextResponse.json({ agent: updated[0] });
  } catch (e) {
    console.error("[agent PUT]", e);
    return NextResponse.json({ error: "Falha ao atualizar agente" }, { status: 500 });
  }
}
