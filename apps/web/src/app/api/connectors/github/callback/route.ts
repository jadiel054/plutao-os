import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { connectors } from "@plutao/db";
import { getDb } from "@/lib/db";
import {
  completeOAuth,
  failOAuth,
  githubDefaultCapabilities,
} from "@/lib/connectors/service";
import {
  exchangeGitHubCode,
  fetchGitHubUser,
  getAppBaseUrl,
} from "@/lib/connectors/githubOAuth";

export const runtime = "nodejs";

/**
 * GET /api/connectors/github/callback?code=&state=
 * Callback OAuth — troca code, grava token cifrado, status → connected.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const base = getAppBaseUrl(req.url);
  const settingsUrl = `${base}/configuracoes?tab=conectores`;

  if (oauthError) {
    const desc = url.searchParams.get("error_description") || oauthError;
    // Melhor esforço: marcar erro se state existir
    if (state) {
      try {
        const db = getDb();
        const rows = await db
          .select()
          .from(connectors)
          .where(eq(connectors.oauthState, state))
          .limit(1);
        if (rows[0]) {
          await failOAuth(rows[0].userId, "github", desc);
        }
      } catch {
        /* ignore */
      }
    }
    return NextResponse.redirect(`${settingsUrl}&connector_error=${encodeURIComponent(desc)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}&connector_error=${encodeURIComponent("code ou state ausente")}`
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(connectors)
      .where(eq(connectors.oauthState, state))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.redirect(
        `${settingsUrl}&connector_error=${encodeURIComponent("state inválido ou expirado")}`
      );
    }

    const redirectUri = `${base}/api/connectors/github/callback`;
    const tokenResult = await exchangeGitHubCode({ code, redirectUri });
    if (!tokenResult.ok) {
      await failOAuth(row.userId, "github", tokenResult.error);
      return NextResponse.redirect(
        `${settingsUrl}&connector_error=${encodeURIComponent(tokenResult.error)}`
      );
    }

    const userResult = await fetchGitHubUser(tokenResult.accessToken);
    if (!userResult.ok) {
      await failOAuth(row.userId, "github", userResult.error);
      return NextResponse.redirect(
        `${settingsUrl}&connector_error=${encodeURIComponent(userResult.error)}`
      );
    }

    const scopes = tokenResult.scope
      ? tokenResult.scope.split(/[\s,]+/).filter(Boolean)
      : ["repo", "read:user"];

    const result = await completeOAuth({
      userId: row.userId,
      provider: "github",
      state,
      accessToken: tokenResult.accessToken,
      scopes,
      accountLogin: userResult.login,
      accountLabel: userResult.name || userResult.login,
      capabilities: githubDefaultCapabilities(),
    });

    if ("error" in result) {
      const errMsg =
        typeof result.error === "string" && result.error.trim()
          ? result.error
          : "falha ao completar OAuth";
      await failOAuth(row.userId, "github", errMsg);
      return NextResponse.redirect(
        `${settingsUrl}&connector_error=${encodeURIComponent(errMsg)}`
      );
    }

    return NextResponse.redirect(`${settingsUrl}&connector_ok=github`);
  } catch (e) {
    console.error("[connectors/github/callback]", e);
    return NextResponse.redirect(
      `${settingsUrl}&connector_error=${encodeURIComponent("falha no callback")}`
    );
  }
}
