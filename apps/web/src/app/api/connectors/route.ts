import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listConnectorsForUser } from "@/lib/connectors/service";
import { isOAuthConfigured } from "@/lib/connectors/connectorOAuth";
import { canEncryptTokens } from "@/lib/connectors/crypto";
import { getAllConnectorManifests } from "@/lib/connectors/manifests";
import { CONNECTOR_CATALOG } from "@plutao/domain";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const connectors = await listConnectorsForUser(user.id);
    const manifests = getAllConnectorManifests();

    const oauthConfigured: Record<string, boolean> = {};
    for (const m of manifests) {
      if (m.authMode === "oauth") {
        oauthConfigured[m.provider] = isOAuthConfigured(m.provider);
      }
    }

    return NextResponse.json({
      connectors,
      catalog: CONNECTOR_CATALOG,
      manifests,
      oauth: {
        githubConfigured: oauthConfigured.github ?? false,
        vercelConfigured: oauthConfigured.vercel ?? false,
        providers: oauthConfigured,
        tokenEncryptionReady: canEncryptTokens(),
      },
    });
  } catch (e) {
    console.error("[connectors GET]", e);
    const msg = e instanceof Error ? e.message : "Falha ao listar conectores";
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
