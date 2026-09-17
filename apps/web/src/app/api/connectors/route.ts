import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listConnectorsForUser } from "@/lib/connectors/service";
import { githubOAuthConfigured } from "@/lib/connectors/githubOAuth";
import { canEncryptTokens } from "@/lib/connectors/crypto";
import { CONNECTOR_CATALOG } from "@plutao/domain";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const connectors = await listConnectorsForUser(user.id);
    return NextResponse.json({
      connectors,
      catalog: CONNECTOR_CATALOG,
      oauth: {
        githubConfigured: githubOAuthConfigured(),
        tokenEncryptionReady: canEncryptTokens(),
      },
    });
  } catch (e) {
    console.error("[connectors GET]", e);
    const msg = e instanceof Error ? e.message : "Falha ao listar conectores";
    // Tabela ainda não migrada
    if (msg.includes("connectors") || msg.includes("relation")) {
      return NextResponse.json(
        {
          error: "Tabela de conectores ainda não aplicada. Rode a migration 0004.",
          detail: msg,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Falha ao listar conectores" }, { status: 500 });
  }
}
