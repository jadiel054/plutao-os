import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { artifacts as artifactsTable, users, usageCounters, conversations } from "@plutao/db";
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
import { recordModelError } from "@/lib/missions/recordModelError";
import { buildReasoningSteps } from "@/lib/chat/buildReasoningSteps";
import { redactSecrets, secretExposureNotice } from "@/lib/security/credentials";
import { persistMessagePair as persistMessagePairLib } from "@/lib/chat/persistChatMessages";
import { emitConnectorToolEvents } from "./emitConnectorToolEvents";
import { OPERATOR_GOLDEN_RULE } from "@/lib/agente/operating-principles";
import {
  buildIdentityBlock,
  loadAgentIdentity,
} from "@/lib/agente/identity";
import {
  sanitizeTitle,
  sanitizeText,
  sanitizeValue,
  sanitizeError,
  sanitizeErrorForClient,
} from "@/lib/security/sanitize";

export const runtime = "nodejs";

// HOTFIX STUB - full restore pending. Chat temporarily returns guidance.
export async function POST(req: NextRequest) {
  return NextResponse.json({
    error: "Chat em restauração. Aguarde 1–2 minutos e tente de novo.",
    message: "O endpoint /api/chat está sendo restaurado após um deploy parcial. Em instantes volta ao normal.",
  }, { status: 503 });
}
