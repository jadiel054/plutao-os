import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listGrantsForUser } from "@/lib/mcp/grants";

export const runtime = "nodejs";

/** Lista grants OAuth MCP do usuário autenticado (para UI de segurança). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const grants = await listGrantsForUser(user.id);
  return NextResponse.json({
    grants: grants.map((g) => ({
      id: g.id,
      clientId: g.clientId,
      redirectUri: g.redirectUri,
      scope: g.scope,
      status: g.revokedAt ? "revoked" : "active",
      revokedAt: g.revokedAt,
      lastUsedAt: g.lastUsedAt,
      createdAt: g.createdAt,
    })),
  });
}
