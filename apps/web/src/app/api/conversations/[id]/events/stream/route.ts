import { NextRequest } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import { listConversationEvents } from "@/lib/events/appendConversationEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/:id/events/stream
 * SSE: replay a partir de Last-Event-ID (seq), depois poll leve até disconnect.
 * Ownership obrigatório. Sem pub/sub — adequado a serverless Vercel.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;
  const check = await checkConversationOwnership(id, user.id);
  if (check.status === 404) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lastEventIdHeader = req.headers.get("last-event-id");
  const searchParams = new URL(req.url).searchParams;
  const cursorParam = searchParams.get("cursor");
  let cursor =
    lastEventIdHeader && Number.isFinite(Number(lastEventIdHeader))
      ? Number(lastEventIdHeader)
      : cursorParam && Number.isFinite(Number(cursorParam))
        ? Number(cursorParam)
        : null;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        let chunk = "";
        if (id != null) chunk += `id: ${id}\n`;
        chunk += `event: ${event}\n`;
        chunk += `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        // Replay inicial
        const first = await listConversationEvents({
          conversationId: id,
          cursor,
          limit: 100,
        });
        for (const ev of first.events) {
          send("event", ev, ev.seq);
          cursor = ev.seq;
        }
        send("ready", { cursor });

        // Live poll (sem infra de pub/sub nesta fase)
        while (!closed) {
          await new Promise((r) => setTimeout(r, 1500));
          if (closed) break;
          const more = await listConversationEvents({
            conversationId: id,
            cursor,
            limit: 50,
          });
          for (const ev of more.events) {
            send("event", ev, ev.seq);
            cursor = ev.seq;
          }
        }
      } catch (err) {
        console.error("[events/stream]", err);
        try {
          send("error", { message: "stream_error" });
        } catch {
          /* ignore */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  // Abort when client disconnects
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
