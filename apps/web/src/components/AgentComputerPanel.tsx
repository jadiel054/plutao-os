"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AgentEvent = {
  id: string;
  conversationId: string;
  seq: number;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  preview: string;
  artifactId: string | null;
  visibility: string;
  createdAt: string;
};

type Props = {
  conversationId: string | null;
  preferOpen?: boolean;
};

function toolLabel(ev: AgentEvent): string {
  const tool = typeof ev.payload?.tool === "string" ? ev.payload.tool : null;
  if (tool) {
    if (tool === "filesystem") return "Filesystem";
    if (tool === "note") return "Note";
    if (tool === "github") return "GitHub";
    if (tool === "vercel") return "Vercel";
    return tool.charAt(0).toUpperCase() + tool.slice(1);
  }
  if (ev.type === "user_message") return "Usuário";
  if (ev.type === "assistant_message") return "Plutão";
  if (ev.type === "action") return "Ação";
  if (ev.type === "observation") return "Resultado";
  return ev.type;
}

function activityLine(ev: AgentEvent): string {
  const tool = typeof ev.payload?.tool === "string" ? ev.payload.tool : null;
  if (ev.type === "action" && tool) {
    const summary =
      typeof ev.payload.inputSummary === "string"
        ? ev.payload.inputSummary
        : ev.preview;
    return `Plutão está usando ${toolLabel(ev)} · ${summary.slice(0, 120)}`;
  }
  if (ev.type === "observation" && tool) {
    const ok = ev.payload.ok !== false;
    return `${ok ? "✓" : "✕"} ${toolLabel(ev)} · ${ev.preview.slice(0, 120)}`;
  }
  if (ev.type === "user_message") return `Você · ${ev.preview.slice(0, 100)}`;
  if (ev.type === "assistant_message") return `Plutão · ${ev.preview.slice(0, 100)}`;
  return ev.preview.slice(0, 140);
}

function focusEvent(events: AgentEvent[]): AgentEvent | null {
  if (events.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "observation" || e.type === "assistant_message") return e;
  }
  return events[events.length - 1] ?? null;
}

/** G2 — Computador do agente, ancorado acima do composer. */
export function AgentComputerPanel({ conversationId, preferOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<"idle" | "live" | "replay" | "error">("idle");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (preferOpen) setOpen(true);
  }, [preferOpen]);

  const mergeEvents = useCallback((incoming: AgentEvent[]) => {
    setEvents((prev) => {
      const bySeq = new Map<number, AgentEvent>();
      for (const e of prev) bySeq.set(e.seq, e);
      for (const e of incoming) bySeq.set(e.seq, e);
      return Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
    });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setEvents([]);
      setCursorIndex(null);
      setStreamStatus("idle");
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    let cancelled = false;
    setStreamStatus("live");

    void (async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/events?limit=100`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data.events) ? (data.events as AgentEvent[]) : [];
        mergeEvents(list);
      } catch {
        /* ignore */
      }
    })();

    const es = new EventSource(
      `/api/conversations/${conversationId}/events/stream`
    );
    esRef.current = es;
    es.addEventListener("event", (msg) => {
      try {
        const ev = JSON.parse((msg as MessageEvent).data) as AgentEvent;
        if (!ev || typeof ev.seq !== "number") return;
        mergeEvents([ev]);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", () => {
      setStreamStatus((s) => (s === "live" ? "error" : s));
    });

    return () => {
      cancelled = true;
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
  }, [conversationId, mergeEvents]);

  const isLive = cursorIndex === null;
  const viewIndex = isLive
    ? Math.max(0, events.length - 1)
    : Math.min(Math.max(0, cursorIndex), Math.max(0, events.length - 1));
  const visibleEvents = useMemo(
    () => (events.length === 0 ? [] : events.slice(0, viewIndex + 1)),
    [events, viewIndex]
  );
  const focus = focusEvent(visibleEvents);
  const recentActivity = useMemo(
    () => [...visibleEvents].reverse().slice(0, 6),
    [visibleEvents]
  );

  const goLive = () => {
    setCursorIndex(null);
    setStreamStatus("live");
  };
  const stepBack = () => {
    if (events.length === 0) return;
    const cur = isLive ? events.length - 1 : viewIndex;
    setCursorIndex(Math.max(0, cur - 1));
    setStreamStatus("replay");
  };
  const stepForward = () => {
    if (events.length === 0) return;
    const cur = isLive ? events.length - 1 : viewIndex;
    if (cur >= events.length - 1) {
      goLive();
      return;
    }
    setCursorIndex(cur + 1);
    setStreamStatus("replay");
  };

  if (!conversationId) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)]">
            Computador · {isLive ? "ao vivo" : `replay #${viewIndex + 1}/${events.length}`}
          </p>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {focus ? activityLine(focus) : "Aguardando atividade nesta conversa"}
          </p>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
          {streamStatus === "live" ? "●" : streamStatus === "replay" ? "◆" : "○"}{" "}
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-[var(--border)]/60 px-3 pb-3 pt-2 space-y-3">
          <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--base)]/40 p-2.5 min-h-[72px]">
            <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">Tela</p>
            {focus ? (
              <div className="space-y-1.5">
                <pre className="text-[11px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono max-h-36 overflow-y-auto">
                  {focus.preview || "(sem preview)"}
                </pre>
                {focus.artifactId ? (
                  <a
                    href={`/api/conversations/${conversationId}/events/artifacts/${focus.artifactId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[10px] font-mono text-[var(--selo)] underline-offset-2 hover:underline"
                  >
                    Full output · artefato
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic">Sem foco ainda.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Atividade</p>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">Nenhum evento.</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {recentActivity.map((ev) => (
                  <li
                    key={ev.id}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] leading-snug ${
                      ev.type === "action"
                        ? "border-[var(--nucleo)]/25 bg-[var(--nucleo)]/5"
                        : ev.type === "observation"
                          ? "border-[var(--success)]/20 bg-[var(--success)]/5"
                          : "border-[var(--border)]/70 bg-[var(--surface)]/40"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-[var(--text-muted)] mr-1">
                      #{ev.seq}
                    </span>
                    {activityLine(ev)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={stepBack}
              disabled={events.length === 0 || viewIndex <= 0}
              className="px-2 py-1 rounded-lg border border-[var(--border)] text-[11px] disabled:opacity-30"
              title="Anterior"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={stepForward}
              disabled={events.length === 0 || (isLive && viewIndex >= events.length - 1)}
              className="px-2 py-1 rounded-lg border border-[var(--border)] text-[11px] disabled:opacity-30"
              title="Próximo"
            >
              ⏭
            </button>
            <button
              type="button"
              onClick={goLive}
              disabled={isLive}
              className="px-2.5 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-30"
            >
              Ir para ao vivo
            </button>
            <span className="text-[10px] font-mono text-[var(--text-muted)] ml-auto">
              {events.length} evt
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
