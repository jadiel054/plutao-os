import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { sessions, users } from "@plutao/db";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "plutao_session";
const SESSION_DAYS = 30;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(opts: {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const db = getDb();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: opts.userId,
    token,
    expiresAt,
    userAgent: opts.userAgent ?? null,
    ip: opts.ip ?? null,
  });

  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function getSessionUser(): Promise<{
  id: string;
  email: string;
  name: string | null;
} | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const db = getDb();
    const now = new Date();
    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return { id: row.userId, email: row.email, name: row.name };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError("UNAUTHORIZED");
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
