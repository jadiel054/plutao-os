import { and, eq } from "drizzle-orm";
import { conversations } from "@plutao/db";

/**
 * Atualização de título protegida contra corrida (concorrência):
 * aplica o novo título SOMENTE quando o título atual ainda é EXATAMENTE o
 * estado automático verificado antes da geração (propriedade + título).
 * Se o usuário renomeou a conversa durante a geração, o update condicional
 * não encontra a linha e o título manual é preservado.
 */
export async function applyGeneratedTitle(
  db: unknown,
  args: { conversationId: string; userId: string; verifiedTitle: string; nextTitle: string }
): Promise<{ applied: boolean }> {
  const exec = db as {
    update: (table: unknown) => {
      set: (values: { title: string }) => {
        where: (condition: unknown) => {
          returning: (columns: { id: unknown }) => Promise<Array<{ id: string }>>;
        };
      };
    };
  };
  const rows = await exec
    .update(conversations)
    .set({ title: args.nextTitle })
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.userId, args.userId),
        eq(conversations.title, args.verifiedTitle)
      )
    )
    .returning({ id: conversations.id });
  return { applied: rows.length > 0 };
}
