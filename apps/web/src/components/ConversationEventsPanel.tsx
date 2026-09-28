"use client";

/**
 * G1 — painel mínimo de eventos (prova de stream).
 * Auto-scroll, colapsável, cards brutos. UI estilo Manus fica para G2.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type EventDTO = {
  id: string;
  seq: number;
  type: string;
  source: string;
  preview: string;
  artifactId: string | null;
  createdAt: string;
};

export function ConversationEventsPanel({
  conversationId,
}: {
  conversationId: string | null | undefined;
}) {
  const [open, setOpen] = useState(true);
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [status, setStatus] = useState<"idle" | "live" | "error">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setEvents([]);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const es = new EventSource(
      `/api/conversations/${encodeURIComponent(conversationId)}/events/stream`
    );

    setStatus("live");

    es.addEventListener("event", (msg) => {
      if (cancelled) return;
      try {
        const data = JSON.parse((msg as MessageEvent).data) as EventDTO;
        cursorRef.current = data.seq;
        setEvents((prev) => {
          if (prev.some((e) => e.id === data.id || e.seq === data.seq)) return prev;
          return [...prev, data].sort((a, b) => a.seq - b.seq);
        });
      } catch {
        /* ignore malformed */
      }
    });

    es.addEventListener("error", () => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      es.close();
    };
  }, [conversationId]);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [events, open, scrollToBottom]);

  if (!conversationId) return null;

  return (
    <div className="border border-zinc-800/80 rounded-lg bg-zinc-950/80 mb-2 text-xs font-mono">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
      >
        <span>
          Eventos {events.length > 0 ? `(${events.length})` : ""}
          {status === "live" ? " · live" : status === "error" ? " · offline" : ""}
        </span>
        <span className="text-zinc-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
          {events.length === 0 && (
            <div className="text-zinc-600 px-1 py-2">Sem eventos ainda.</div>
          )}
          {events.map((ev) => (
            <div
              key={ev.id}
              className="rounded border border-zinc-800/60 bg-zinc-900/60 px-2 py-1 text-zinc-300"
            >
              <div className="flex gap-2 text-[10px] text-zinc-500 mb-0.5">
                <span>#{ev.seq}</span>
                <span className="text-zinc-400">{ev.type}</span>
                <span>{ev.source}</span>
                {ev.artifactId ? <span className="text-amber-600">artifact</span> : null}
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
