import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { formatFileSize } from "@/lib/artifacts";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessToken, getConnectorRow } from "@/lib/connectors/service";
import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage, MultimodalContentPart } from "@/lib/runtime/model/types";
import { VISION_CAPABLE_PROVIDERS, buildImageParts } from "@/lib/runtime/model/imageParts";
import { extractSuggestedPlan } from "@/lib/missions/extractPlan";
import { detectAndExecuteGitHubTool, type GitHubToolExecutionResult } from "@/lib/chat/githubToolRunner";
import { detectAndExecuteVercelTool, type VercelToolExecutionResult } from "@/lib/chat/vercelToolRunner";
import { buildReasoningSteps } from "@/lib/chat/buildReasoningSteps";
import { redactSecrets, secretExposureNotice } from "@/lib/security/credentials";

export const runtime = "nodejs";

// TEMPORARY STUB — full route being restored in next commit
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return NextResponse.json(
    {
      error: "CHAT_ROUTE_RESTORING",
      message: "Rota de chat em restauração. Aguarde o próximo deploy (1–2 min).",
    },
    { status: 503 }
  );
}
