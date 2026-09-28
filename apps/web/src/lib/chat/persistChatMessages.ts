import { eq } from "drizzle-orm";
import { conversations, messages as messagesTable } from "@plutao/db";
import type { getDb } from "@/lib/db";
import { emitUserMessage, emitAssistantMessage } from "@/lib/events/appendConversationEvent";

type Db = ReturnType<typeof getDb>;

/** Persist user+assistant pair and append scrubbed conversation events (G1). */
export async function persistMessagePair(
  db: Db,
  conversationId: string | null,
  userText: string,
  assistantText: string
) {
  if (!conversationId) return;
  try {
    const now = new Date();
    await db.insert(messagesTable).values([
      {
        conversationId,
        role: "user",
        content: userText,
        createdAt: now,
      },
      {
        conversationId,
        role: "assistant",
        content: assistantText,
        createdAt: new Date(now.getTime() + 10),
      },
    ]);

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    void emitUserMessage(conversationId, userText).catch((e) =>
      console.error("[events user_message]", e)
    );
    void emitAssistantMessage(conversationId, assistantText).catch((e) =>
      console.error("[events assistant_message]", e)
    );
  } catch (err) {
    console.error("[persistMessagePair error - chat response preserved]", err);
  }
}
