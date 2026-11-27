"use client";

/**
 * Painel de eventos em tempo real da conversa (SSE append-only).
 * Estados: conectando, live, reconectando (backoff), erro, vazio.
 * Dedupe por id/seq; replay via Last-Event-ID + cursor; histórico com teto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeEvents, nextBackoffMs, type PanelEvent } from "@/lib/events/eventsPanelLogic";

type Status = "idle" | "connecting" | "live" | "reconnecting" | "error";

const STATUS_LABEL: Record<Status, string> = {
  idle: "inativo",
  connecting: "conectando…",
  live: "live",
  reconnecting: "reconectando…",
  error: "sem conexão",
};

export function ConversationEventsPanel({
  conversationId,
}: {
  conversationId: string | null | undefined;
}) {
  const [open, setOpen] = useState(true);
  const [events, setEvents] = useState<PanelEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [retryToken, setRetryToken] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setEvents([]);
      setStatus("idle");
      cursorRef.current = null;
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const cursor = cursorRef.current;
      const url =
        "/api/conversations/" + encodeURIComponent(conversationId) + "/events/stream" +
        (cursor != null ? "?cursor=" + cursor : "");
      es = new EventSource(url);

      // NOTA: "ready" NÃO reseta o contador de falhas. O backoff cresce a cada
      // erro consecutivo até o teto (nextBackoffMs), mesmo depois de já ter
      // havido conexão estabelecida; evita loop de reconexão agressiva.
      es.addEventListener("ready", () => {
        if (cancelled) return;
        setStatus("live");
      });

      es.addEventListener("event", (msg) => {
        if (cancelled) return;
        try {
          const data = JSON.parse((msg as MessageEvent).data) as PanelEvent;
          if (typeof data?.seq !== "number" || typeof data?.id !== "string") return;
          cursorRef.current = data.seq;
          setEvents((prev) => mergeEvents(prev, data));
        } catch {
          /* ignora evento malformado */
        }
      });

      // Fim limpo do servidor (reciclagem serverless): reconexão imediata via Last-Event-ID.
      es.addEventListener("end", () => {
        if (cancelled) return;
        setStatus("reconnecting");
        es?.close();
        timer = setTimeout(connect, 250);
      });

      es.addEventListener("error", () => {
        if (cancelled) return;
        setStatus("reconnecting");
        es?.close();
        attempt += 1;
        timer = setTimeout(connect, nextBackoffMs(attempt));
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [conversationId, retryToken]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [events, open, scrollToBottom]);

  if (!conversationId) return null;

  const statusColor =
    status === "live"
      ? "text-emerald-400"
      : status === "reconnecting" || status === "connecting"
        ? "text-amber-400"
        : status === "error"
          ? "text-red-400"
          : "text-zinc-500";

  return (
    <div className="border border-zinc-800/80 rounded-lg bg-zinc-950/80 mb-2 text-xs font-mono">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
      >
        <span>
          Eventos {events.length > 0 ? "(" + events.length + ")" : ""}
          {" · "}
          <span className={statusColor}>{STATUS_LABEL[status]}</span>
        </span>
        <span className="text-zinc-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-1">
          {status === "connecting" && events.length === 0 && (
            <div className="text-zinc-500 px-1 py-2 animate-pulse">Conectando ao stream de eventos…</div>
          )}
          {status !== "connecting" && events.length === 0 && (
            <div className="text-zinc-600 px-1 py-2">
              {status === "live"
                ? "Conectado. Nenhum evento ainda nesta conversa."
                : "Nenhum evento recebido."}
            </div>
          )}
          {(status === "reconnecting" || status === "error") && (
            <div className="flex items-center gap-2 px-1 py-1.5 text-amber-400">
              <span>{status === "reconnecting" ? "Reconexão em andamento; histórico preservado." : "Conexão perdida."}</span>
              <button
                type="button"
                onClick={() => setRetryToken((t) => t + 1)}
                className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-500"
              >
                Reconectar agora
              </button>
            </div>
          )}
          {events.map((ev) => (
            <div
              key={ev.id}
              className={
                "rounded border px-2 py-1 " +
                (ev.type === "observation"
                  ? String((ev as unknown as { payload?: { ok?: boolean } }).payload?.ok) === "false"
                    ? "border-red-900/60 bg-red-950/20 text-zinc-300"
                    : "border-zinc-800/60 bg-zinc-900/60 text-zinc-300"
                  : "border-zinc-800/60 bg-zinc-900/60 text-zinc-300")
              }
            >
              <div className="flex gap-2 text-[10px] text-zinc-500 mb-0.5">
                <span>#{ev.seq}</span>
                <span className="text-zinc-400">{ev.type}</span>
                <span>{ev.source}</span>
                {ev.artifactId ? <span className="text-amber-600">artifact</span> : null}
                <span className="ml-auto">
                  {ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString("pt-BR") : ""}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-zinc-300 line-clamp-4">
                {ev.preview || "—"}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
