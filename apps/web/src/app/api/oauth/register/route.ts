import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient } from "@/lib/mcp/grants";
import { parseOAuthClientRegistration } from "@/lib/mcp/clientRegistration";

export const runtime = "nodejs";

function registrationError(error: string, description: string, status = 400) {
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

/** RFC 7591 — public OAuth client registration for MCP clients using PKCE. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return registrationError("invalid_client_metadata", "request body must be valid JSON");
  }

  const parsed = parseOAuthClientRegistration(body);
  if (!parsed.ok) {
    return registrationError("invalid_client_metadata", parsed.error);
  }

  const clientId = `prt_client_${randomBytes(24).toString("base64url")}`;
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
