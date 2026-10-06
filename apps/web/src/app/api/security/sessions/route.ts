import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sessions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { AuthError, requireUser, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

function unauthorized() { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Dispositivo desconhecido";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ios/i.test(userAgent)) return "iPhone/iPad";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh|mac os/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Navegador";
}

export async function GET() {
  try {
    const user = await requireUser();
    const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
    const rows = await getDb().select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt, token: sessions.token }).from(sessions).where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())));
    return NextResponse.json({ sessions: rows.map((row) => ({ id: row.id, device: deviceLabel(row.userAgent), userAgent: row.userAgent, createdAt: row.createdAt, expiresAt: row.expiresAt, current: row.token === currentToken })) });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    console.error("[GET /api/security/sessions]", error);
    return NextResponse.json({ error: "Falha ao listar sessões" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const db = getDb();
    if (body?.allOther === true) {
      const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
      const current = currentToken ? (await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.token, currentToken))).limit(1))[0] : null;
      if (current) await db.delete(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.id, current.id)));
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      if (current) await db.insert(sessions).values({ userId: user.id, token: currentToken!, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), createdAt: new Date(), userAgent: request.headers.get("user-agent"), ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });
      return NextResponse.json({ ok: true });
    }
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Sessão inválida" }, { status: 400 });
    const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
    const current = currentToken ? (await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.id, id), eq(sessions.token, currentToken))).limit(1))[0] : null;
    if (current) return NextResponse.json({ error: "A sessão atual não pode ser revogada por aqui" }, { status: 400 });
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.id, id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    console.error("[DELETE /api/security/sessions]", error);
    return NextResponse.json({ error: "Falha ao revogar sessão" }, { status: 500 });
  }
}
