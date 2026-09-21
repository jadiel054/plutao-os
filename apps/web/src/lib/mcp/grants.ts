/**
 * Persistência de grants OAuth MCP (revogação, refresh, codes single-use).
 */

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { createDb, mcpAuthCodes, mcpOauthGrants } from "@plutao/db";

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newRefreshTokenPlain(): string {
  return `prt_${randomBytes(32).toString("base64url")}`;
}

export async function createGrant(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}): Promise<{ grantId: string }> {
  const db = createDb();
  const [row] = await db
    .insert(mcpOauthGrants)
    .values({
      userId: input.userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: input.scope,
    })
    .returning({ id: mcpOauthGrants.id });
  if (!row) throw new Error("failed to create mcp grant");
  return { grantId: row.id };
}

export async function storeAuthCode(input: {
  jti: string;
  grantId: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  expiresAt: Date;
}): Promise<void> {
  const db = createDb();
  await db.insert(mcpAuthCodes).values({
    jti: input.jti,
    grantId: input.grantId,
    userId: input.userId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scope: input.scope,
    codeChallenge: input.codeChallenge,
    expiresAt: input.expiresAt,
  });
}

/** Consome code: valida jti no DB, marca used_at, retorna dados. Single-use real. */
export async function consumeAuthCodeRow(jti: string): Promise<{
  grantId: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
} | null> {
  const db = createDb();
  const [row] = await db
    .select()
    .from(mcpAuthCodes)
    .where(eq(mcpAuthCodes.jti, jti))
    .limit(1);
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  const updated = await db
    .update(mcpAuthCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(mcpAuthCodes.jti, jti), isNull(mcpAuthCodes.usedAt)))
    .returning({ jti: mcpAuthCodes.jti });
  if (!updated.length) return null;

  return {
    grantId: row.grantId,
    userId: row.userId,
    clientId: row.clientId,
    redirectUri: row.redirectUri,
    scope: row.scope,
    codeChallenge: row.codeChallenge,
  };
}

export async function attachRefreshToken(
  grantId: string,
  refreshPlain: string,
  expiresAt: Date
): Promise<void> {
  const db = createDb();
  await db
    .update(mcpOauthGrants)
    .set({
      refreshTokenHash: hashToken(refreshPlain),
      refreshExpiresAt: expiresAt,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(mcpOauthGrants.id, grantId), isNull(mcpOauthGrants.revokedAt)));
}

export async function findGrantByRefreshToken(refreshPlain: string): Promise<{
  id: string;
  userId: string;
  clientId: string;
  scope: string;
  redirectUri: string;
} | null> {
  const db = createDb();
  const hash = hashToken(refreshPlain);
  const [row] = await db
    .select()
    .from(mcpOauthGrants)
    .where(and(eq(mcpOauthGrants.refreshTokenHash, hash), isNull(mcpOauthGrants.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() < Date.now()) return null;
  return {
    id: row.id,
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
    redirectUri: row.redirectUri,
  };
}

export async function isGrantActive(grantId: string): Promise<boolean> {
  const db = createDb();
  const [row] = await db
    .select({ revokedAt: mcpOauthGrants.revokedAt })
    .from(mcpOauthGrants)
    .where(eq(mcpOauthGrants.id, grantId))
    .limit(1);
  if (!row) return false;
  return row.revokedAt == null;
}

export async function touchGrant(grantId: string): Promise<void> {
  const db = createDb();
  await db
    .update(mcpOauthGrants)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(mcpOauthGrants.id, grantId));
}

export async function revokeGrant(grantId: string, userId: string): Promise<boolean> {
  const db = createDb();
  const updated = await db
    .update(mcpOauthGrants)
    .set({
      revokedAt: new Date(),
      refreshTokenHash: null,
      refreshExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(mcpOauthGrants.id, grantId), eq(mcpOauthGrants.userId, userId), isNull(mcpOauthGrants.revokedAt)))
    .returning({ id: mcpOauthGrants.id });
  return updated.length > 0;
}

export async function revokeGrantByRefreshOrAccess(opts: {
  token: string;
  tokenTypeHint?: string;
}): Promise<boolean> {
  const db = createDb();
  const hash = hashToken(opts.token);
  const byRefresh = await db
    .update(mcpOauthGrants)
    .set({
      revokedAt: new Date(),
      refreshTokenHash: null,
      refreshExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(mcpOauthGrants.refreshTokenHash, hash), isNull(mcpOauthGrants.revokedAt)))
    .returning({ id: mcpOauthGrants.id });
  if (byRefresh.length) return true;
  return false;
}

export async function listGrantsForUser(userId: string) {
  const db = createDb();
  return db
    .select({
      id: mcpOauthGrants.id,
      clientId: mcpOauthGrants.clientId,
      redirectUri: mcpOauthGrants.redirectUri,
      scope: mcpOauthGrants.scope,
      revokedAt: mcpOauthGrants.revokedAt,
      lastUsedAt: mcpOauthGrants.lastUsedAt,
      createdAt: mcpOauthGrants.createdAt,
    })
    .from(mcpOauthGrants)
    .where(eq(mcpOauthGrants.userId, userId))
    .orderBy(desc(mcpOauthGrants.createdAt))
    .limit(50);
}
