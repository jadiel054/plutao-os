import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthRegistrationQuota, createOAuthClient } from "@/lib/mcp/grants";
import { DYNAMIC_OAUTH_CLIENT_ID_PREFIX, parseOAuthClientRegistration } from "@/lib/mcp/clientRegistration";
import { hashOAuthRegistrationIp } from "@/lib/mcp/tokens";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_REGISTRATIONS_PER_HOUR = 10;

function registrationError(error: string, description: string, status = 400, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        ...extraHeaders,
      },
    }
  );
}

/** RFC 7591 — public OAuth client registration for MCP clients using PKCE. */
export async function POST(req: NextRequest) {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return registrationError("invalid_client_metadata", "request body exceeds 16 KiB", 413);
  }

  const ip = req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  try {
    const allowed = await consumeOAuthRegistrationQuota(
      hashOAuthRegistrationIp(ip),
      MAX_REGISTRATIONS_PER_HOUR
    );
    if (!allowed) {
      const now = new Date();
      const nextHour = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1);
      const retryAfter = Math.max(1, Math.ceil((nextHour - now.getTime()) / 1000));
      return registrationError(
        "too_many_requests",
        "registration limit exceeded; try again next hour",
        429,
        { "Retry-After": String(retryAfter) }
      );
    }
  } catch (error) {
    console.error("[POST /api/oauth/register] rate-limit check failed.", error);
    return registrationError("server_error", "registration quota unavailable", 503);
  }

  let body: unknown;
  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return registrationError("invalid_client_metadata", "request body exceeds 16 KiB", 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return registrationError("invalid_client_metadata", "request body must be valid JSON");
  }

  const parsed = parseOAuthClientRegistration(body);
  if (!parsed.ok) {
    if (parsed.error === "invalid_redirect_uri") {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: parsed.description,
          reason: parsed.reason,
          invalid_uri: parsed.redirectUri,
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
        },
      );
    }
    return registrationError(parsed.error, parsed.description);
  }

  const clientId = `${DYNAMIC_OAUTH_CLIENT_ID_PREFIX}${randomBytes(24).toString("base64url")}`;
  const issuedAt = Math.floor(Date.now() / 1000);
  try {
    await createOAuthClient({ clientId, ...parsed.metadata });
  } catch {
    return registrationError("server_error", "could not persist OAuth client registration", 503);
  }

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      redirect_uris: parsed.metadata.redirectUris,
      grant_types: parsed.metadata.grantTypes,
      response_types: parsed.metadata.responseTypes,
      token_endpoint_auth_method: parsed.metadata.tokenEndpointAuthMethod,
      ...(parsed.metadata.clientName ? { client_name: parsed.metadata.clientName } : {}),
    },
    {
      status: 201,
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
