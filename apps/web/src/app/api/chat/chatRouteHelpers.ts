import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable, users, usageCounters, conversations, messages as messagesTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getPlanDefinition, PRESET_MODELS } from "@plutao/domain";
import { formatFileSize } from "@/lib/artifacts";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { incrementGuestMessageCount, GuestRateLimitError } from "@/lib/auth/guest";
import { loadConnectorRuntime, runConnectedConnectorTools, type ConnectorRuntimeSnapshot } from "@/lib/chat/connectorRuntime";
import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";
import { buildFollowUps } from "@/lib/chat/buildFollowUps";
import { getModelConfig } from "@/lib/runtime/model/config";
import { resolveCloudModelConfig } from "@/lib/runtime/model/resolveConfig";
import { chatCompletion, streamChatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage, MultimodalContentPart } from "@/lib/runtime/model/types";
import { VISION_CAPABLE_PROVIDERS, buildImageParts } from "@/lib/runtime/model/imageParts";
import { extractSuggestedPlan } from "@/lib/missions/extractPlan";
import { buildReasoningSteps } from "@/lib/chat/buildReasoningSteps";
import { redactSecrets, secretExposureNotice } from "@/lib/security/credentials";
import { persistMessagePair } from "@/lib/chat/persistChatMessages";

export type ChatInputMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AttachedArtifactMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  metadata: Record<string, unknown>;
};

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_TOTAL_HISTORY_LENGTH = 16000;

export async function getOrCreateConversation(
  db: ReturnType<typeof getDb>,
  userId: string,
  providedConversationId?: string | null,
  initialText?: string
): Promise<string | null> {
  try {
    if (providedConversationId) {
      const existing = await db
        .select({ id: conversations.id, userId: conversations.userId })
        .from(conversations)
        .where(eq(conversations.id, providedConversationId))
        .limit(1);

      if (existing[0] && existing[0].userId === userId) {
        return existing[0].id;
      }
    }

    const title = initialText && initialText.trim() ? initialText.trim().slice(0, 40) : "Nova conversa";
    const now = new Date();
    const created = await db
      .insert(conversations)
      .values({
        userId,
        title,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id });

    return created[0]?.id ?? null;
  } catch (err) {
    console.error("[getOrCreateConversation error]", err);
    return null;
  }
}

export async function incrementUsageCounter(db: ReturnType<typeof getDb>, userId: string, isPremium: boolean) {
  const todayStr = new Date().toISOString().split("T")[0];
  try {
    const existing = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, todayStr)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(usageCounters)
        .set({
          messages: existing[0].messages + 1,
          premiumMessages: isPremium ? existing[0].premiumMessages + 1 : existing[0].premiumMessages,
        })
        .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, todayStr)));
    } else {
      await db.insert(usageCounters).values({
        userId,
        day: todayStr,
        messages: 1,
        premiumMessages: isPremium ? 1 : 0,
      });
    }
  } catch (err) {
    console.error("[incrementUsageCounter error]", err);
  }
}

export {
  eq,
  inArray,
  and,
  agents,
  artifactsTable,
  users,
  usageCounters,
  conversations,
  messagesTable,
  getDb,
  getPlanDefinition,
  PRESET_MODELS,
  formatFileSize,
  getAuthOrGuestUser,
  incrementGuestMessageCount,
  GuestRateLimitError,
  loadConnectorRuntime,
  runConnectedConnectorTools,
  detectSuggestedConnectors,
  buildFollowUps,
  getModelConfig,
  resolveCloudModelConfig,
  chatCompletion,
  streamChatCompletion,
  VISION_CAPABLE_PROVIDERS,
  buildImageParts,
  extractSuggestedPlan,
  buildReasoningSteps,
  redactSecrets,
  secretExposureNotice,
  persistMessagePair,
};
export type { ConnectorRuntimeSnapshot, ModelConfig, ModelMessage, MultimodalContentPart, NextRequest, NextResponse };
