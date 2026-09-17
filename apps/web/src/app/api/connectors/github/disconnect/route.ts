import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { disconnectConnector } from "@/lib/connectors/service";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await disconnectConnector(user.id, "github");
    if ("error" in result) {
      return NextResponse.json({ error: "Conector não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ connector: result.connector });
  } catch (e) {
    console.error("[connectors/github/disconnect]", e);
    return NextResponse.json({ error: "Falha ao desconectar" }, { status: 500 });
  }
}
