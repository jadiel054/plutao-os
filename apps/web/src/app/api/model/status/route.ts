import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getModelConfig } from "@/lib/runtime/model/config";

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
    });
  }
  return NextResponse.json({
    configured: true,
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  });
}
