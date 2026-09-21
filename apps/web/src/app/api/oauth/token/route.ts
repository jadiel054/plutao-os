import { NextRequest, NextResponse } from "next/server";
import {
  consumeAuthorizationCode,
  issueAccessToken,
  timingSafeStringEqual,
  verifyPkceS256,
} from "@/lib/mcp/tokens";

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

/**
 * OAuth 2.1 Token Endpoint — grant authorization_code + PKCE.
 * token_endpoint_auth_methods_supported: none (public clients).
 */
export async function POST(req: NextRequest) {
  let grantType = "";
  let code = "";
  let redirectUri = "";
  let clientId = "";
  let codeVerifier = "";

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, string>;
      grantType = String(body.grant_type || "");
      code = String(body.code || "");
      redirectUri = String(body.redirect_uri || "");
      clientId = String(body.client_id || "");
      codeVerifier = String(body.code_verifier || "");
    } else {
      const form = await req.formData();
      grantType = String(form.get("grant_type") || "");
      code = String(form.get("code") || "");
      redirectUri = String(form.get("redirect_uri") || "");
      clientId = String(form.get("client_id") || "");
      codeVerifier = String(form.get("code_verifier") || "");
    }
  } catch {
    return tokenError("invalid_request", "corpo inválido");
  }

  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type");
  }
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return tokenError("invalid_request", "code, redirect_uri, client_id e code_verifier obrigatórios");
  }

  let claims;
  try {
    claims = consumeAuthorizationCode(code);
  } catch {
    return tokenError("server_error", "token signing não configurado", 503);
  }

  if (!claims) {
    return tokenError("invalid_grant", "código inválido ou expirado");
  }
  if (!timingSafeStringEqual(claims.client_id, clientId)) {
    return tokenError("invalid_grant", "client_id não confere");
  }
  if (!timingSafeStringEqual(claims.redirect_uri, redirectUri)) {
    return tokenError("invalid_grant", "redirect_uri não confere");
  }
  if (!verifyPkceS256(codeVerifier, claims.code_challenge)) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  const issued = issueAccessToken({
    userId: claims.sub,
    clientId: claims.client_id,
    scope: claims.scope,
  });

  return NextResponse.json(
    {
      access_token: issued.accessToken,
      token_type: issued.tokenType,
      expires_in: issued.expiresIn,
      scope: issued.scope,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
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
