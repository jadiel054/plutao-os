import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { beginOAuth } from "@/lib/connectors/service";
import {
  buildGitHubAuthorizeUrl,
  getAppBaseUrl,
  githubOAuthConfigured,
} from "@/lib/connectors/githubOAuth";
import { canEncryptTokens } from "@/lib/connectors/crypto";

export const runtime = "nodejs";

/**
 * POST /api/connectors/github/authorize
 * Inicia OAuth: status → authorizing, devolve URL do GitHub.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!githubOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "GitHub OAuth não configurado. Defina GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET no ambiente.",
        code: "OAUTH_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  if (!canEncryptTokens()) {
    return NextResponse.json(
      {
        error:
          "Criptografia de tokens indisponível. Defina CONNECTOR_TOKEN_SECRET ou SESSION_SECRET (≥16 chars).",
        code: "CRYPTO_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  try {
    const { state } = await beginOAuth(user.id, "github");
    const base = getAppBaseUrl(req.url);
    const redirectUri = `${base}/api/connectors/github/callback`;
    const authorizeUrl = buildGitHubAuthorizeUrl({ state, redirectUri });
    return NextResponse.json({
      status: "authorizing",
      authorizeUrl,
      redirectUri,
    });
  } catch (e) {
    console.error("[connectors/github/authorize]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao iniciar OAuth" },
      { status: 500 }
    );
  }
}
