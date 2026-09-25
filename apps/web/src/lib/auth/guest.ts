import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { eq, and, gte, sql } from "drizzle-orm";
import { guestSessions, users, missions, artifacts, conversations, auditEvents } from "@plutao/db";
import { getDb } from "@/lib/db";

export const GUEST_COOKIE = "plutao_guest_session";
export const GUEST_MAX_MESSAGES = 10;
export const GUEST_WINDOW_MS = 15 * 60 * 1000; // 15 minutos em ms
export const GUEST_MAX_SESSIONS_PER_IP_PER_DAY = 3;

export type GuestSessionInfo = {
  id: string;
  token: string;
  userId: string;
  messageCount: number;
  firstMessageAt: Date | null;
  expiresAt: Date;
  isLimitReached: boolean;
  messagesRemaining: number;
  secondsRemaining: number;
  limitReason?: "messages" | "time" | null;
};

export class GuestRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestRateLimitError";
  }
}

export function generateGuestToken(): string {
  return `gst_${randomBytes(24).toString("base64url")}`;
}

export async function getGuestSessionByToken(token: string): Promise<GuestSessionInfo | null> {
  if (!token) return null;
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: guestSessions.id,
        token: guestSessions.token,
        userId: guestSessions.userId,
        messageCount: guestSessions.messageCount,
        firstMessageAt: guestSessions.firstMessageAt,
        expiresAt: guestSessions.expiresAt,
        convertedUserId: guestSessions.convertedUserId,
      })
      .from(guestSessions)
      .where(eq(guestSessions.token, token))
      .limit(1);

    const gs = rows[0];
    if (!gs || gs.convertedUserId) return null;

    const now = Date.now();
    if (gs.expiresAt.getTime() < now) return null;

    let timeExpired = false;
    let secondsRemaining = 900;
    if (gs.firstMessageAt) {
      const elapsed = now - gs.firstMessageAt.getTime();
      secondsRemaining = Math.max(0, Math.floor((GUEST_WINDOW_MS - elapsed) / 1000));
      if (elapsed >= GUEST_WINDOW_MS) {
        timeExpired = true;
      }
    }

    const messagesExceeded = gs.messageCount >= GUEST_MAX_MESSAGES;
    const isLimitReached = messagesExceeded || timeExpired;
    const limitReason = messagesExceeded ? "messages" : timeExpired ? "time" : null;
    const messagesRemaining = Math.max(0, GUEST_MAX_MESSAGES - gs.messageCount);

    return {
      id: gs.id,
      token: gs.token,
      userId: gs.userId,
      messageCount: gs.messageCount,
      firstMessageAt: gs.firstMessageAt,
      expiresAt: gs.expiresAt,
      isLimitReached,
      messagesRemaining,
      secondsRemaining,
      limitReason,
    };
  } catch (err) {
    console.error("[getGuestSessionByToken] Erro de banco de dados ao buscar sessão guest:", err);
    throw err;
  }
}

export async function createGuestSession(opts: {
  ip?: string | null;
  userAgent?: string | null;
}): Promise<GuestSessionInfo> {
  const db = getDb();
  const ip = opts.ip || "127.0.0.1";

  // Rate limit: máximo 3 sessões guest por IP por dia
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const ipCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guestSessions)
    .where(and(eq(guestSessions.ip, ip), gte(guestSessions.createdAt, startOfToday)));

  if ((ipCount[0]?.count ?? 0) >= GUEST_MAX_SESSIONS_PER_IP_PER_DAY) {
    throw new GuestRateLimitError(
      "Muitas sessões de convidado foram criadas hoje a partir deste IP (máximo 3). Crie uma conta gratuita para continuar sem interrupções."
    );
  }

  const token = generateGuestToken();
  const now = new Date();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias de retenção
  const guestEmail = `guest_${randomBytes(8).toString("hex")}@guest.plutao.ai`;

  // Criar usuário guest no banco
  const userRows = await db
    .insert(users)
    .values({
      email: guestEmail,
      name: "Convidado",
      isGuest: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: users.id });

  const guestUserId = userRows[0]!.id;

  // Criar sessão guest no banco
  const sessionRows = await db
    .insert(guestSessions)
    .values({
      token,
      userId: guestUserId,
      ip,
      userAgent: opts.userAgent ?? null,
      messageCount: 0,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: guestSessions.id });

  const guestSessionId = sessionRows[0]!.id;

  // Registrar evento de analytics
  await db.insert(auditEvents).values({
    userId: guestUserId,
    type: "guest_started",
    payload: { ip, userAgent: opts.userAgent, guestSessionId },
    createdAt: now,
  });

  // Definir cookie
  const jar = await cookies();
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return {
    id: guestSessionId,
    token,
    userId: guestUserId,
    messageCount: 0,
    firstMessageAt: null,
    expiresAt,
    isLimitReached: false,
    messagesRemaining: GUEST_MAX_MESSAGES,
    secondsRemaining: 900,
  };
}

export async function incrementGuestMessageCount(guestSessionId: string): Promise<GuestSessionInfo | null> {
  const db = getDb();
  const now = new Date();

  const current = await db
    .select()
    .from(guestSessions)
    .where(eq(guestSessions.id, guestSessionId))
    .limit(1);

  const gs = current[0];
  if (!gs) return null;

  const firstMessageAt = gs.firstMessageAt ?? now;
  const newCount = gs.messageCount + 1;

  await db
    .update(guestSessions)
    .set({
      messageCount: newCount,
      firstMessageAt,
      updatedAt: now,
    })
    .where(eq(guestSessions.id, guestSessionId));

  const updated = await getGuestSessionByToken(gs.token);

  if (updated && updated.isLimitReached) {
    await db.insert(auditEvents).values({
      userId: gs.userId,
      type: "guest_limit_reached",
      payload: {
        guestSessionId,
        messageCount: updated.messageCount,
        limitReason: updated.limitReason,
      },
      createdAt: now,
    });
  }

  return updated;
}

export async function migrateGuestSessionToUser(guestToken: string, realUserId: string): Promise<boolean> {
  if (!guestToken || !realUserId) return false;
  try {
    const db = getDb();
    const gs = await getGuestSessionByToken(guestToken);
    if (!gs || gs.userId === realUserId) return false;

    const guestUserId = gs.userId;
    const now = new Date();

    // Reatribuir missões, artefatos e conversas
    await db.update(missions).set({ userId: realUserId }).where(eq(missions.userId, guestUserId));
    await db.update(artifacts).set({ userId: realUserId }).where(eq(artifacts.userId, guestUserId));
    await db.update(conversations).set({ userId: realUserId }).where(eq(conversations.userId, guestUserId));

    // Marcar sessão guest como convertida
    await db
      .update(guestSessions)
      .set({ convertedUserId: realUserId, updatedAt: now })
      .where(eq(guestSessions.id, gs.id));

    // Registrar evento de analytics
    await db.insert(auditEvents).values({
      userId: realUserId,
      type: "guest_converted",
      payload: { guestUserId, guestSessionId: gs.id },
      createdAt: now,
    });

    // Não deletar user guest aqui — preserva guest_sessions (FK CASCADE).
    // Expurgo fica a cargo de /api/cron/cleanup-guests (converted_user_id IS NULL + idade).

    // Limpar cookie guest
    const jar = await cookies();
    jar.delete(GUEST_COOKIE);

    return true;
  } catch (err) {
    console.error("Erro ao migrar sessão guest:", err);
    return false;
  }
}

export async function handleGuestMigrationOnAuth(req: NextRequest, targetUserId: string): Promise<boolean> {
  const guestToken = req.cookies.get(GUEST_COOKIE)?.value;
  if (!guestToken) return false;
  return migrateGuestSessionToUser(guestToken, targetUserId);
}
