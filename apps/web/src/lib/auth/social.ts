import { getDb } from "@/lib/db";
import { users } from "@plutao/db";
import { eq } from "drizzle-orm";
import { ensureUserInFounderWaitlist } from "./waitlist";

export async function getOrCreateUserByEmail(
  email: string,
  name?: string | null
): Promise<{ id: string; email: string; name: string | null; isNewUser: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();

  // 1. Account linking check: if user already exists, return existing user
  const existingRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingRows.length > 0) {
    const existing = existingRows[0];
    // Ensure existing user is also in waitlist
    await ensureUserInFounderWaitlist(normalizedEmail);
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      isNewUser: false,
    };
  }

  // 2. Create new user without password (passwordHash = null for social / magic link)
  const inserted = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      name: name ? name.trim() : null,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
    });

  const newUser = inserted[0];

  // 3. Ensure new user enters founder waitlist
  await ensureUserInFounderWaitlist(normalizedEmail);

  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    isNewUser: true,
  };
}
