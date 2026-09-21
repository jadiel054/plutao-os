import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { peekAuthorizationCode, verifyAccessToken } from "@/lib/mcp/tokens";
import { revokeGrant, revokeGrantByRefreshOrAccess } from "@/lib/mcp/grants";

export const runtime = "nodejs";

/**
 * RFC 7009-style token revocation (best-effort).
 * Also supports authenticated user revoking by grant_id (JSON body).
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const user = await getSessionUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    if (user && body.grant_id) {
      const ok = await revokeGrant(String(body.grant_id), user.id);
      return NextResponse.json(
        { revoked: ok },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const token = String(body.token || body.refresh_token || "");
    if (token) {
      await revokeByToken(token);
      return NextResponse.json(
        { revoked: true },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }

  try {
    const form = await req.formData();
    const token = String(form.get("token") || "");
    if (!token) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    await revokeByToken(token);
    return new Response(null, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}

async function revokeByToken(token: string): Promise<boolean> {
  const byRefresh = await revokeGrantByRefreshOrAccess({ token });
  if (byRefresh) return true;

  try {
    const claims = verifyAccessToken(token);
    if (claims?.grant_id && claims.sub) {
      return revokeGrant(claims.grant_id, claims.sub);
    }
  } catch {
    /* ignore */
  }

  try {
    const code = peekAuthorizationCode(token);
    if (code?.grant_id && code.sub) {
      return revokeGrant(code.grant_id, code.sub);
    }
  } catch {
    /* ignore */
  }

  return false;
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
