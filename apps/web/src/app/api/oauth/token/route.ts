import { NextRequest, NextResponse } from "next/server";
import {
  issueAccessToken,
  peekAuthorizationCode,
  refreshExpiresAt,
  refreshTtlSec,
  timingSafeStringEqual,
  verifyPkceS256,
} from "@/lib/mcp/tokens";
import {
  attachRefreshToken,
  consumeAuthCodeRow,
  findGrantByRefreshToken,
  newRefreshTokenPlain,
  touchGrant,
} from "@/lib/mcp/grants";

export const runtime = "nodejs";

function tokenError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

function tokenOk(body: Record<string, unknown>) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * OAuth 2.1 Token Endpoint — authorization_code + PKCE e refresh_token.
 * token_endpoint_auth_methods_supported: none (public clients).
 */
export async function POST(req: NextRequest) {
  let grantType = "";
  let code = "";
  let redirectUri = "";
  let clientId = "";
  let codeVerifier = "";
  let refreshToken = "";

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, string>;
      grantType = String(body.grant_type || "");
      code = String(body.code || "");
      redirectUri = String(body.redirect_uri || "");
      clientId = String(body.client_id || "");
      codeVerifier = String(body.code_verifier || "");
      refreshToken = String(body.refresh_token || "");
    } else {
      const form = await req.formData();
      grantType = String(form.get("grant_type") || "");
      code = String(form.get("code") || "");
      redirectUri = String(form.get("redirect_uri") || "");
      clientId = String(form.get("client_id") || "");
      codeVerifier = String(form.get("code_verifier") || "");
      refreshToken = String(form.get("refresh_token") || "");
    }
  } catch {
    return tokenError("invalid_request", "corpo inválido");
  }

  if (grantType === "refresh_token") {
    if (!refreshToken || !clientId) {
      return tokenError("invalid_request", "refresh_token e client_id obrigatórios");
    }
    const grant = await findGrantByRefreshToken(refreshToken);
    if (!grant) {
      return tokenError("invalid_grant", "refresh_token inválido ou revogado");
    }
    if (!timingSafeStringEqual(grant.clientId, clientId)) {
      return tokenError("invalid_grant", "client_id não confere");
    }
    const issued = issueAccessToken({
      userId: grant.userId,
      clientId: grant.clientId,
      scope: grant.scope,
      grantId: grant.id,
    });
    const newRefresh = newRefreshTokenPlain();
    await attachRefreshToken(grant.id, newRefresh, refreshExpiresAt());
    await touchGrant(grant.id);
    return tokenOk({
      access_token: issued.accessToken,
      token_type: issued.tokenType,
      expires_in: issued.expiresIn,
      scope: issued.scope,
      refresh_token: newRefresh,
      refresh_expires_in: refreshTtlSec(),
    });
  }

  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type");
  }
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return tokenError("invalid_request", "code, redirect_uri, client_id e code_verifier obrigatórios");
  }

  let peeked;
  try {
    peeked = peekAuthorizationCode(code);
  } catch {
    return tokenError("server_error", "token signing não configurado", 503);
  }
  if (!peeked) {
    return tokenError("invalid_grant", "código inválido ou expirado");
  }
  if (!timingSafeStringEqual(peeked.client_id, clientId)) {
    return tokenError("invalid_grant", "client_id não confere");
  }
  if (!timingSafeStringEqual(peeked.redirect_uri, redirectUri)) {
    return tokenError("invalid_grant", "redirect_uri não confere");
  }
  if (!verifyPkceS256(codeVerifier, peeked.code_challenge)) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  const consumed = await consumeAuthCodeRow(peeked.jti);
  if (!consumed) {
    return tokenError("invalid_grant", "código já usado, inválido ou expirado");
  }

  const issued = issueAccessToken({
    userId: consumed.userId,
    clientId: consumed.clientId,
    scope: consumed.scope,
    grantId: consumed.grantId,
  });
  const refreshPlain = newRefreshTokenPlain();
  await attachRefreshToken(consumed.grantId, refreshPlain, refreshExpiresAt());

  return tokenOk({
    access_token: issued.accessToken,
    token_type: issued.tokenType,
    expires_in: issued.expiresIn,
    scope: issued.scope,
    refresh_token: refreshPlain,
    refresh_expires_in: refreshTtlSec(),
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
