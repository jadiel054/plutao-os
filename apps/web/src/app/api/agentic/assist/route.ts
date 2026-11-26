import { NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { APP_SURFACES } from "@/lib/agentic/app-surface";
import { describePage, diagnosePage } from "@/lib/agentic/ui-perception";
import { parseVoiceCommand, respondToVoiceCommand } from "@/lib/agentic/voice-assist";
import { buildGuidedPlan } from "@/lib/agentic/guided-assist";
import { listExperiences } from "@/lib/agentic/experience-store";
import type { PageState } from "@/lib/agentic/ui-perception";

export const dynamic = "force-dynamic";

/**
 * API de assistência do núcleo agêntico: voz/contexto sobre as superfícies
 * do próprio Plutão. GET = inventário; POST = comando (voz ou texto) com
 * contexto da página. Responde com plano/reply; a EXECUÇÃO autorizada
 * acontece no cliente (NixVoiceAssist) via InteractionExecutor.
 */
export async function GET() {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const experiences = await listExperiences(user.id, undefined, 20);
  return NextResponse.json({
    surfaces: APP_SURFACES.map((s) => ({ pageId: s.pageId, route: s.route, purpose: s.purpose })),
    experiencesAvailable: experiences.length > 0,
    experienceCount: experiences.length,
  });
}

export async function POST(req: Request) {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { text?: string; pageId?: string; pageState?: PageState };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").slice(0, 2000);
  const pageId = body.pageId ?? "chat";

  const command = parseVoiceCommand(text);
  const response = respondToVoiceCommand(command, {
    pageId,
    hasPageState: Boolean(body.pageState),
  });

  const pageState = body.pageState ?? undefined;
  const pageDescription = describePage(pageId, pageState);
  const guided =
    command.intent === "guided_goal" || command.intent === "explain"
      ? buildGuidedPlan(text)
      : null;
  const diagnosis = pageState ? diagnosePage(pageId, pageState) : null;

  return NextResponse.json({
    command,
    response,
    pageDescription,
    guided,
    diagnosis,
    interaction: response.interaction ?? null,
  });
}
