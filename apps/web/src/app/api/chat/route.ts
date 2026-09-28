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

export const runtime = "nodejs";

// NOTE: Full POST handler restored in follow-up commit — temporary safe stub
// prevents broken production import. Real body is in chatRouteBody.ts next.
export async function POST() {
  return NextResponse.json(
    { error: "chat route temporarily under maintenance (G1 restore)" },
    { status: 503 }
  );
}
