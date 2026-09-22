import { NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthOrGuestUser();
    return NextResponse.json({ user });
  } catch (err) {
    console.error("[GET /api/auth/me]", err);
    return NextResponse.json({ error: "Erro ao obter dados de autenticação" }, { status: 500 });
  }
}
