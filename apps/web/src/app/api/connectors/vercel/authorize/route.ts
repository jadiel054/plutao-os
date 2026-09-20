import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { beginOAuth } from "@/lib/connectors/service";
import {
  buildVercelAuthorizeUrl,
  getAppBaseUrl,
  vercelIntegrationConfigured,
} from "@/lib/connectors/vercelOAuth";
import { canEncryptTokens } from "@/lib/connectors/crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!vercelIntegrationConfigured()) {
    return NextResponse.json(
      {
        error:
          "Integration Vercel não configurada. Defina VERCEL_CLIENT_ID e VERCEL_CLIENT_SECRET, ou use connect-token com Access Token.",
        code: "OAUTH_NOT_CONFIGURED",
        alternative: "connect-token",
      },
      { status: 503 }
    );
  }

  if (!canEncryptTokens()) {
    return NextResponse.json(
      {
        error: "Criptografia de tokens indisponível. Defina CONNECTOR_TOKEN_SECRET (≥16 chars).",
        code: "CRYPTO_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  try {
    const { state } = await beginOAuth(user.id, "vercel");
    const base = getAppBaseUrl(req.url);
    const redirectUri = `${base}/api/connectors/vercel/callback`;
    const authorizeUrl = buildVercelAuthorizeUrl({ state, redirectUri });
    return NextResponse.json({
      status: "authorizing",
      authorizeUrl,
      redirectUri,
    });
  } catch (e) {
    console.error("[connectors/vercel/authorize]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao iniciar OAuth Vercel" },
      { status: 500 }
    );
  }
}
