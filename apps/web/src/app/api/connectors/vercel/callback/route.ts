import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { completeOAuth, failOAuth } from "@/lib/connectors/service";
import {
  exchangeVercelCode,
  getAppBaseUrl,
  verifyVercelToken,
  vercelDefaultCapabilities,
} from "@/lib/connectors/vercelOAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = getAppBaseUrl(req.url);
  const settingsUrl = `${base}/configuracoes?tab=conectores`;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(
      `${settingsUrl}&connector_error=${encodeURIComponent(String(err))}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}&connector_error=${encodeURIComponent("code_ou_state_ausente")}`
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(`${base}/login?next=/configuracoes`);
  }

  try {
    const redirectUri = `${base}/api/connectors/vercel/callback`;
    const exchanged = await exchangeVercelCode({ code, redirectUri });
    if (!exchanged.ok) {
      await failOAuth(user.id, "vercel", exchanged.error);
      return NextResponse.redirect(
        `${settingsUrl}&connector_error=${encodeURIComponent(exchanged.error)}`
      );
    }

    const identity = await verifyVercelToken(exchanged.accessToken);
    const login = identity.ok ? identity.login : exchanged.userId || "vercel";
    const label = identity.ok ? identity.name : null;

    const result = await completeOAuth({
      userId: user.id,
      provider: "vercel",
      state,
      accessToken: exchanged.accessToken,
      accountLogin: login,
      accountLabel: label,
      capabilities: vercelDefaultCapabilities(),
      scopes: [],
    });

    if ("error" in result && result.error) {
      const errMsg = typeof result.error === "string" ? result.error : "complete_oauth_failed";
      await failOAuth(user.id, "vercel", errMsg);
      return NextResponse.redirect(
        `${settingsUrl}&connector_error=${encodeURIComponent(errMsg)}`
      );
    }

    return NextResponse.redirect(`${settingsUrl}&connector_ok=vercel`);
  } catch (e) {
    console.error("[connectors/vercel/callback]", e);
    const msg = e instanceof Error ? e.message : "callback_error";
    try {
      await failOAuth(user.id, "vercel", msg);
    } catch {
      /* ignore */
    }
    return NextResponse.redirect(
      `${settingsUrl}&connector_error=${encodeURIComponent(msg)}`
    );
  }
}
