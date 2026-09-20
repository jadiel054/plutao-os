import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { disconnectConnector } from "@/lib/connectors/service";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await disconnectConnector(user.id, "vercel");
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ status: "disconnected", connector: result.connector });
}
