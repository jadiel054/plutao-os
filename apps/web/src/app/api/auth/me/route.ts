import { NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthOrGuestUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sessão não encontrada ou expirada." },
        { status: 401 }
      );
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error("[GET /api/auth/me]", err);
    return NextResponse.json(
      { error: "Erro ao obter dados de autenticação" },
      { status: 500 }
    );
  }
}
