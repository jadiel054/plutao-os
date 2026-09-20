import { getDb } from "@/lib/db";
import { founderWaitlist } from "@plutao/db";
import { eq, sql } from "drizzle-orm";

export async function ensureUserInFounderWaitlist(email: string): Promise<{ position: number }> {
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();

  const existing = await db
    .select({ position: founderWaitlist.position })
    .from(founderWaitlist)
    .where(eq(founderWaitlist.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    return { position: existing[0].position };
  }

  const [maxPosResult] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${founderWaitlist.position}), 0)` })
    .from(founderWaitlist);

  const nextPosition = (Number(maxPosResult?.maxPos) || 0) + 1;

  const [inserted] = await db
    .insert(founderWaitlist)
    .values({
      email: normalizedEmail,
      position: nextPosition,
    })
    .returning({ position: founderWaitlist.position });

  return { position: inserted.position };
}
