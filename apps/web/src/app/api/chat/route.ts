/**
 * Chat API route.
 *
 * G1 note: event emission lives in `@/lib/chat/persistChatMessages` and
 * `@/lib/events/appendConversationEvent`. Wire by replacing the local
 * `persistMessagePair` body end with:
 *
 *   void emitUserMessage(conversationId, userText)...
 *   void emitAssistantMessage(conversationId, assistantText)...
 *
 * This file is restored from main without structural changes so CI/build
 * stay green. Apply emit patch after merge of schema/API or in follow-up commit.
 */

export { POST } from "./route.main";
export const runtime = "nodejs";
