import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { conversations, messages as messagesTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { sanitizeTitle } from "@/lib/security/sanitize";
import { applyGeneratedTitle } from "@/lib/chat/guardedTitleUpdate";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_TITLE_CHARS = 80;

function fallbackTitle(userText: string): string | null {
  const words = userText.trim().split(/\s+/).slice(0, 6).join(" ");
  return words ? words.slice(0, 60) : null;
}

/**
 * Titulos gerados automaticamente sao substituiveis:
 * - padroes conhecidos ("Nova conversa", "Conversa Importada");
 * - titulo igual aos primeiros caracteres da primeira mensagem do usuario
 *   (comportamento atual do getOrCreateConversation).
 * Titulo definido pelo usuario (renomear) NUNCA e sobrescrito.
 */
function isAutoTitle(current: string, firstUserText: string): boolean {
  const trimmed = current.trim();
  if (!trimmed || trimmed === "Nova conversa" || trimmed === "Conversa Importada") return true;
  const derived = sanitizeTitle(firstUserText.trim().slice(0, 40));
  return Boolean(derived) && derived === trimmed;
}

/**
 * Gera e atualiza o titulo da conversa a partir do conteudo REAL da
 * primeira troca (primeira mensagem do usuario + resposta do assistente).
 * Idempotente: so altera quando o titulo atual é automatico.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const db = getDb();
    const [conv] = await db
      .select({ id: conversations.id, title: conversations.title })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
      .limit(1);
    if (!conv) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    const rows = await db
      .select({ role: messagesTable.role, content: messagesTable.content })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt))
      .limit(6);

    const firstUser = rows.find((r) => r.role === "user")?.content ?? "";
    const firstAssistant = rows.find((r) => r.role === "assistant")?.content ?? "";
    if (!firstUser.trim()) {
      return NextResponse.json({ updated: false, title: conv.title });
    }

    if (!isAutoTitle(conv.title, firstUser)) {
      return NextResponse.json({ updated: false, title: conv.title });
    }

    let title: string | null = null;
    const modelConfig = getModelConfig();
    if (modelConfig) {
      try {
        const context = [
          firstUser.slice(0, 800),
          firstAssistant ? "Resumo da resposta: " + firstAssistant.slice(0, 400) : "",
        ].filter(Boolean).join("\n\n");
        const result = await chatCompletion(modelConfig, [
          {
            role: "system",
            content:
              "Gere um título curto (máximo 6 palavras, português do Brasil, sem aspas, sem ponto final, sem emojis) que resuma o assunto principal da conversa a seguir. Responda SOMENTE com o título.",
          },
          { role: "user", content: context },
        ]);
        const clean = sanitizeTitle(
          String(result.content || "")
            .trim()
            .replace(/^["']+|["']+$/g, "")
            .split("\n")[0]
            .slice(0, MAX_TITLE_CHARS),
        );
        if (clean) title = clean;
      } catch {
        /* fallback abaixo */
      }
    }

    if (!title) title = fallbackTitle(firstUser);
    if (!title || !title.trim()) {
      return NextResponse.json({ updated: false, title: conv.title });
    }

    const finalTitle = title.trim().slice(0, MAX_TITLE_CHARS);
    // Concorrência: o update final confirma propriedade E que o título ainda
    // corresponde ao estado automático verificado antes da geração. Se o
    // usuário renomeou durante a geração, o título manual é preservado.
    const guard = await applyGeneratedTitle(db, {
      conversationId: id,
      userId: user.id,
      verifiedTitle: conv.title,
      nextTitle: finalTitle,
    });
    if (!guard.applied) {
      return NextResponse.json({ updated: false, superseded: true, title: conv.title });
    }

    return NextResponse.json({ updated: true, title: finalTitle });
  } catch (err) {
    console.error("[POST /api/conversations/:id/title]", err);
    return NextResponse.json({ error: "Erro ao gerar título da conversa" }, { status: 500 });
  }
}
