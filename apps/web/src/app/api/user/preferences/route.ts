import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";

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
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const preferences = (rows[0]?.preferences as PreferencesShape) ?? {};
    return NextResponse.json({ preferences });
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

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select({ preferences: users.preferences })
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
    };
    const updated = await db
      .update(users)
      .set({
        preferences: merged,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({ preferences: users.preferences });

    return NextResponse.json({ preferences: updated[0]?.preferences ?? {} });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[PATCH /api/user/preferences]", e);
    return NextResponse.json({ error: "Falha ao salvar preferências" }, { status: 500 });
  }
}
