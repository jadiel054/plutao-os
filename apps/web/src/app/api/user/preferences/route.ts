import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { PRESET_MODELS } from "@plutao/domain";

export const runtime = "nodejs";

type VoicePrefs = {
  enabled?: boolean;
  packId?: string;
  voiceId?: string;
  speed?: number;
  volume?: number;
};

type PreferencesShape = {
  voice?: VoicePrefs;
  onboarding_seen?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function sanitizeVoice(input: unknown): VoicePrefs | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  const out: VoicePrefs = {};
  if (typeof v.enabled === "boolean") out.enabled = v.enabled;
  if (typeof v.packId === "string" && v.packId.length <= 64) out.packId = v.packId;
  if (typeof v.voiceId === "string" && v.voiceId.length <= 64) out.voiceId = v.voiceId;
  if (typeof v.speed === "number" && Number.isFinite(v.speed)) {
    out.speed = clamp(v.speed, 0.5, 2);
  }
  if (typeof v.volume === "number" && Number.isFinite(v.volume)) {
    out.volume = clamp(v.volume, 0, 1);
  }
  return out;
}

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db
      .select({ preferences: users.preferences, preferredModel: users.preferredModel })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const preferences = (rows[0]?.preferences as PreferencesShape) ?? {};
    const preferredModel = rows[0]?.preferredModel ?? null;
    return NextResponse.json({ preferences, preferredModel });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[GET /api/user/preferences]", e);
    return NextResponse.json({ error: "Falha ao ler preferências" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const patch: PreferencesShape = {};
    if ("voice" in body) {
      const voice = sanitizeVoice(body.voice);
      if (voice === undefined && body.voice != null) {
        return NextResponse.json({ error: "voice inválido" }, { status: 400 });
      }
      if (voice) patch.voice = voice;
    }
    if ("onboarding_seen" in body) {
      if (typeof body.onboarding_seen === "boolean") {
        patch.onboarding_seen = body.onboarding_seen;
      }
    }

    let preferredModelToUpdate: string | undefined = undefined;
    if ("preferredModel" in body) {
      const targetModel = PRESET_MODELS.find((m) => m.id === body.preferredModel);
      if (typeof body.preferredModel !== "string" || !targetModel || targetModel.comingSoon) {
        return NextResponse.json({ error: "Modelo preferido inválido" }, { status: 400 });
      }
      preferredModelToUpdate = body.preferredModel;
    }

    if (Object.keys(patch).length === 0 && preferredModelToUpdate === undefined) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select({ preferences: users.preferences, preferredModel: users.preferredModel })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const current = (existing[0]?.preferences as PreferencesShape) ?? {};
    const merged: PreferencesShape = {
      ...current,
      ...(patch.voice
        ? {
            voice: {
              ...(typeof current.voice === "object" && current.voice ? current.voice : {}),
              ...patch.voice,
            },
          }
        : {}),
      ...(typeof patch.onboarding_seen === "boolean"
        ? { onboarding_seen: patch.onboarding_seen }
        : {}),
    };

    const updateFields: Record<string, unknown> = {
      preferences: merged,
      updatedAt: new Date(),
    };

    if (preferredModelToUpdate !== undefined) {
      updateFields.preferredModel = preferredModelToUpdate;
    }

    const updated = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, user.id))
      .returning({ preferences: users.preferences, preferredModel: users.preferredModel });

    return NextResponse.json({
      preferences: updated[0]?.preferences ?? {},
      preferredModel: updated[0]?.preferredModel ?? null,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[PATCH /api/user/preferences]", e);
    return NextResponse.json({ error: "Falha ao salvar preferências" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return PATCH(req);
}
