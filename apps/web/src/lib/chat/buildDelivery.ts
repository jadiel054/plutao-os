/**
 * Entrega persistente da criação no Chat: copia os arquivos do sandbox da
 * conversa para a tabela artifacts (metadata source=chat_build), para que o
 * resultado sobreviva a reload, nova requisição e retomada do worker, e o
 * usuário possa acessar/baixar os arquivos produzidos.
 * Best-effort: falha de entrega NUNCA quebra o fluxo de criação.
 */

import { and, eq, sql } from "drizzle-orm";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { storageList, storageRead } from "@/lib/runtime/tools/storage";
import { detectArtifactType } from "@/lib/artifacts";

const MAX_FILES = 100;
const MAX_FILE_CHARS = 400_000;

function joinPath(dir: string, name: string): string {
  if (!dir || dir === ".") return name;
  return dir + "/" + name;
}

async function collectFiles(executionId: string, dir: string, acc: string[]): Promise<void> {
  if (acc.length >= MAX_FILES) return;
  const list = await storageList(executionId, { path: dir });
  for (const entry of list.entries ?? []) {
    if (acc.length >= MAX_FILES) return;
    const full = joinPath(dir, entry.name);
    if (entry.type === "directory") {
      await collectFiles(executionId, full, acc);
    } else {
      acc.push(full);
    }
  }
}

/**
 * Snapshot dos arquivos do sandbox da conversa como artifacts do usuário.
 * Cada persistência substitui o snapshot anterior da mesma conversa.
 */
export async function persistChatBuildArtifacts(opts: {
  userId: string;
  conversationId: string | null;
}): Promise<{ persisted: number; paths: string[] }> {
  if (!opts.conversationId) return { persisted: 0, paths: [] };
  try {
    const paths: string[] = [];
    await collectFiles(opts.conversationId, ".", paths);
    if (paths.length === 0) return { persisted: 0, paths: [] };

    const rows: Array<{
      userId: string;
      missionId: null;
      name: string;
      type: string;
      size: number;
      content: string;
      metadata: Record<string, string>;
    }> = [];
    for (const path of paths) {
      const file = await storageRead(opts.conversationId, { path });
      if (!file || typeof file.content !== "string") continue;
      if (file.content.length > MAX_FILE_CHARS) continue;
      rows.push({
        userId: opts.userId,
        missionId: null,
        name: path,
        type: detectArtifactType(path).type,
        size: file.content.length,
        content: file.content,
        metadata: { source: "chat_build", conversationId: opts.conversationId },
      });
    }
    if (rows.length === 0) return { persisted: 0, paths: [] };

    const db = getDb();
    await db
      .delete(artifacts)
      .where(
        and(
          eq(artifacts.userId, opts.userId),
          sql`${artifacts.metadata}->>'source' = 'chat_build'`,
          sql`${artifacts.metadata}->>'conversationId' = ${opts.conversationId}`
        )
      );
    const inserted = await db.insert(artifacts).values(rows).returning({ id: artifacts.id });
    return { persisted: inserted.length, paths: rows.map((r) => r.name) };
  } catch {
    return { persisted: 0, paths: [] };
  }
}
