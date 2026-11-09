import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditEvents, conversations, messages } from "@plutao/db";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { checkMcpRateLimit } from "@/lib/mcp/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set(["up", "down"]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkMcpRateLimit(`feedback:${user.id}`);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retry_after_sec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rating = String(body.rating ?? "");
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

  if (!ALLOWED.has(rating)) {
    return NextResponse.json({ error: "rating must be 'up' or 'down'" }, { status: 400 });
  }
  if (!messageId || !conversationId) {
    return NextResponse.json({ error: "messageId and conversationId required" }, { status: 400 });
  }

  const db = getDb();
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
    .limit(1);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const [msg] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  await db.insert(auditEvents).values({
    userId: user.id,
    type: "chat.message_feedback",
    payload: {
      message_id: messageId,
      conversation_id: conversationId,
      rating,
      ts: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}
