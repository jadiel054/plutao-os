/**
 * Fases 2+3 — STREAM DA TELA REAL (CDP Screencast → SSE autenticado).
 *
 * Frames JPEG do Chromium REAL da sessão, retransmitidos APENAS para o
 * dono da conversa. Nenhum token/host do provedor é exposto; a conexão
 * CDP fica entre o servidor Plutão e o provedor. Cliente reconecta com
 * Last-Event-ID/índice de frame (a sessão serve o frame mais recente).
 */
import { NextRequest } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import { computerSessions } from "@/lib/computer/sessionManager";
import type { ComputerScreenFrame } from "@/lib/computer/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 280;

const STREAM_MAX_MS = 240_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Garante o canal vivo DESTA instância a partir do registro durável
  // (cross-instance: assume o canal quando o lease do dono expira — abre
  // navegador novo no Free). Sem registro → 404; canal vivo em outra
  // instância ainda → 409 CHANNEL_BUSY (a UI tenta de novo).
  const session = await computerSessions.ensureSession(conversationId, user.id);
  if (!session) {
    const record = await computerSessions
      .durableView(conversationId, user.id)
      .then((view) => (view.channelOwner === "elsewhere" ? "CHANNEL_BUSY" : "SESSION_NOT_FOUND"));
    const status = record === "CHANNEL_BUSY" ? 409 : 404;
    return new Response(JSON.stringify({ error: record }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const startedAt = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        let chunk = "";
        if (id != null) chunk += `id: ${id}\n`;
        chunk += `event: ${event}\n`;
        chunk += `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      let lastFrameIndex = 0;
      const unsubscribe = session.subscribeScreen((frame: ComputerScreenFrame) => {
        send("frame", { data: frame.data, width: frame.width, height: frame.height, capturedAt: frame.capturedAt }, ++lastFrameIndex);
      });

      const statusTimer = setInterval(() => {
        const snap = session.snapshot();
        // Heartbeat do canal para o store durável (mantém o lease da
        // instância viva enquanto existir espectador conectado).
        void computerSessions.heartbeat(session).catch(() => undefined);
        send("status", { status: snap.status, controller: snap.controller, leaseExpiresAt: snap.leaseExpiresAt, error: snap.error });
      }, 2000);

      const last = (session as { getLastFrame?: () => ComputerScreenFrame | null }).getLastFrame?.();
      if (last) send("frame", { data: last.data, width: last.width, height: last.height, capturedAt: last.capturedAt });

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(statusTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };

      const watchdog = setInterval(() => {
        const snap = session.snapshot();
        if (closed || Date.now() - startedAt > STREAM_MAX_MS || snap.status === "closed" || snap.status === "expired") {
          clearInterval(watchdog);
          send("bye", { status: snap.status });
          finish();
        }
      }, 1000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
