import { NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth";
import { describePage, findControl, planInteraction } from "@/lib/agentic/ui-perception";
import { respondToVoiceCommand } from "@/lib/agentic/voice-assist";
import { buildGuidedPlan, diagnosePage } from "@/lib/agentic/guided-assist";
import { listExperiences } from "@/lib/agentic/experience-store";
import { findSurface, listSurfaces } from "@/lib/agentic/app-surface";

export const dynamic = "force-dynamic";

/**
 * API de assistência do núcleo agêntico: voz/contexto sobre as superfícies
 * do próprio Plutão. GET = inventário; POST = intenção (voz ou contexto).
 */
export async function GET() {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const experiences = await listExperiences(user.id, undefined, 20);
  return NextResponse.json({
    surfaces: listSurfaces().map((s) => ({ id: s.id, title: s.title, route: s.route, purpose: s.purpose })),
    experiencesAvailable: experiences.length > 0,
    experienceCount: experiences.length,
  });
}

export async function POST(req: Request) {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { text?: string; pageId?: string; pageState?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").slice(0, 2000).trim();
  const surface = body.pageId ? findSurface(body.pageId) : null;

  const command = respondToVoiceCommand(text ?? "", {
    pageId: surface?.id,
    pageState: body.pageState,
  });

  const pageDescription = surface
    ? describePage(surface.id, body.pageState)
    : null;
  const guided = command.intent === "guided_goal" || command.intent === "explain"
    ? buildGuidedPlan(text ?? "")
    : null;
  const diagnosis = surface ? diagnosePage(surface.id, body.pageState) : null;
  const control = command.controlId
    ? findControl(surface?.id ?? "", command.controlId)
    : null;
  const interaction = control && surface
    ? planInteraction(surface.id, control.controlId, command.intent === "toggle_control" ? "toggle" : "click")
    : null;

  return NextResponse.json({
    command,
    pageDescription,
    guided,
    diagnosis,
    control,
    interaction,
  });
}
