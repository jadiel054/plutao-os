import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import { pickScreenFile } from "@/lib/chat/computer";
import { runFilesystem } from "@/lib/runtime/tools/filesystem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/computer/:conversationId/screen
 * Tela real da máquina: lê o HTML existente no sandbox da conversa
 * (namespace userId__conversationId) para renderização em iframe sandboxado.
 * Sem HTML ainda → found:false (a UI mostra o terminal/eventos).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const list = await runFilesystem(
    JSON.stringify({ action: "list", payload: { path: "." } }),
    conversationId,
    user.id
  );
  if (!list.ok) {
    return NextResponse.json({ found: false });
  }

  let entries: Array<{ name: string; type?: string | null }> = [];
  try {
    const parsed = JSON.parse(list.output) as { entries?: Array<{ name: string; type?: string | null }> };
    entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return NextResponse.json({ found: false });
  }

  const screenFile = pickScreenFile(entries);
  if (!screenFile) {
    return NextResponse.json({ found: false, entries });
  }

  const read = await runFilesystem(
    JSON.stringify({ action: "read", payload: { path: screenFile } }),
    conversationId,
    user.id
  );
  if (!read.ok) {
    return NextResponse.json({ found: false, path: screenFile });
  }

  let content = "";
  try {
    const parsed = JSON.parse(read.output) as { content?: unknown };
    content = typeof parsed.content === "string" ? parsed.content : "";
  } catch {
    return NextResponse.json({ found: false, path: screenFile });
  }

  return NextResponse.json({ found: true, path: screenFile, content });
}
