import { eq } from "drizzle-orm";
import { conversations, messages as messagesTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { emitUserMessage, emitAssistantMessage } from "@/lib/events/appendConversationEvent";
import { sanitizeText } from "@/lib/security/sanitize";

type Db = ReturnType<typeof getDb>;

/** Persist user+assistant pair and append scrubbed conversation events (G1/G2). */
export async function persistMessagePair(
  db: Db,
  conversationId: string | null,
  userText: string,
  assistantText: string
) {
  if (!conversationId) return;
  try {
    const now = new Date();
    const safeUserText = sanitizeText(userText);
    const safeAssistantText = sanitizeText(assistantText);
    await db.insert(messagesTable).values([
      {
        conversationId,
        role: "user",
        content: safeUserText,
        createdAt: now,
      },
      {
        conversationId,
        role: "assistant",
        content: safeAssistantText,
        createdAt: new Date(now.getTime() + 10),
      },
    ]);

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    // Ordenação: user seq < assistant seq (cadeia await, não paralelo)
    void (async () => {
      try {
        await emitUserMessage(conversationId, safeUserText);
        await emitAssistantMessage(conversationId, safeAssistantText);
      } catch (e) {
        console.error("[events persistMessagePair ordered]", e);
      }
    })();
  } catch (err) {
    console.error("[persistMessagePair error - chat response preserved]", err);
  }
}
