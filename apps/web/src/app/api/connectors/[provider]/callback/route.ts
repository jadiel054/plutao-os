import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { completeOAuth, failOAuth } from "@/lib/connectors/service";
import {
  getAppBaseUrl,
  exchangeOAuthCode,
  fetchUserInfo,
  getDefaultCapabilities,
} from "@/lib/connectors/connectorOAuth";
import { getConnectorManifest } from "@/lib/connectors/manifests";
import type { ConnectorProviderId } from "@plutao/domain";
import { getDb } from "@/lib/db";
import { connectors } from "@plutao/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> | { provider: string } }
) {
  const resolvedParams = await context.params;
  const provider = resolvedParams.provider as ConnectorProviderId;
  const manifest = getConnectorManifest(provider);

  const baseUrl = getAppBaseUrl(req.url);
  const redirectTarget = `${baseUrl}/configuracoes`;

  if (!manifest) {
    return NextResponse.redirect(`${redirectTarget}?connector_error=${encodeURIComponent(`Conector '${provider}' inválido`)}`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errParam = searchParams.get("error");
  const errDesc = searchParams.get("error_description");

  // Find authorizing user by state or fallback to current session
  let userId: string | null = null;
  if (state) {
    const db = getDb();
    const rows = await db
      .select({ userId: connectors.userId })
      .from(connectors)
      .where(eq(connectors.oauthState, state))
      .limit(1);
    if (rows[0]) userId = rows[0].userId;
  }

  if (!userId) {
    const user = await getSessionUser();
    if (user) userId = user.id;
  }

  if (errParam || !code || !state) {
    const desc = errDesc || errParam || "code_ou_state_ausente";
    if (userId) {
      await failOAuth(userId, provider, desc);
    }
    return NextResponse.redirect(
      `${redirectTarget}?connector_error=${encodeURIComponent(`Falha no OAuth de ${manifest.displayName}: ${desc}`)}`
    );
  }

  if (!userId) {
    return NextResponse.redirect(
      `${redirectTarget}?connector_error=${encodeURIComponent("Sessão não encontrada para o callback OAuth")}`
    );
  }

  try {
    const redirectUri = `${baseUrl}/api/connectors/${provider}/callback`;
    const exchanged = await exchangeOAuthCode(provider, { code, redirectUri });

    if (!exchanged.ok) {
      await failOAuth(userId, provider, exchanged.error);
      return NextResponse.redirect(
        `${redirectTarget}?connector_error=${encodeURIComponent(exchanged.error)}`
      );
    }

    const userResult = await fetchUserInfo(provider, exchanged.accessToken);
    if (!userResult.ok) {
      await failOAuth(userId, provider, userResult.error);
      return NextResponse.redirect(
        `${redirectTarget}?connector_error=${encodeURIComponent(userResult.error)}`
      );
    }

    const capabilities = getDefaultCapabilities(provider);

    const result = await completeOAuth({
      userId,
      provider,
      state,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      accountLogin: userResult.login,
      accountLabel: userResult.name || userResult.login,
      scopes: manifest.defaultScopes ?? [],
      capabilities,
    });

    if ("error" in result) {
      const errMsg =
        result.error === "STATE_MISMATCH"
          ? "Sessão OAuth inválida ou expirada"
          : "Falha ao atualizar conector";
      await failOAuth(userId, provider, errMsg);
      return NextResponse.redirect(
        `${redirectTarget}?connector_error=${encodeURIComponent(errMsg)}`
      );
    }

    return NextResponse.redirect(`${redirectTarget}?connector_ok=${provider}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_desconhecido";
    await failOAuth(userId, provider, msg);
    return NextResponse.redirect(
      `${redirectTarget}?connector_error=${encodeURIComponent(msg)}`
    );
  }
}
