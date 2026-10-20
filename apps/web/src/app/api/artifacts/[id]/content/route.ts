import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return new Response("UNAUTHORIZED", { status: 401 });

  const { id } = await ctx.params;
  const [row] = await getDb()
    .select({ metadata: artifacts.metadata, type: artifacts.type, size: artifacts.size })
    .from(artifacts)
    .where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id)))
    .limit(1);

  if (!row) return new Response("Artifact não encontrado", { status: 404 });
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const blobUrl = typeof metadata.blobUrl === "string" ? metadata.blobUrl : null;

  if (blobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await get(blobUrl, { access: "private" });
      if (blob?.statusCode === 200) {
        return new Response(blob.stream, {
          status: 200,
          headers: {
            "Content-Type": blob.headers.get("content-type") || row.type,
            "Content-Length": blob.headers.get("content-length") || String(row.size),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    } catch (error) {
      console.error("[artifacts/:id/content] blob read failed", error instanceof Error ? error.message : String(error));
    }
  }

  return new Response("Conteúdo privado indisponível", { status: 404 });
}
