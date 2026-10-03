import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getModelConfig } from "@/lib/runtime/model/config";
import { formatModelLabel } from "@/lib/runtime/model/label";
import { PRESET_MODELS } from "@plutao/domain";

export const runtime = "nodejs";

/** Authenticated probe: is MODEL_API_KEY configured? (never returns the key) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const cfg = getModelConfig();
  if (!cfg) {
    return NextResponse.json({
      configured: false,
      provider: null,
      model: null,
      label: null,
    });
  }

  const matched = PRESET_MODELS.find(
    (m) =>
      m.id.toLowerCase().includes(cfg.model.toLowerCase()) ||
      m.name.toLowerCase().includes(cfg.model.toLowerCase())
  );
  const label = matched?.name ?? formatModelLabel(cfg.provider, cfg.model);

  return NextResponse.json({
    configured: true,
    provider: cfg.provider,
    model: cfg.model,
    label,
    baseUrl: cfg.baseUrl,
  });
}
