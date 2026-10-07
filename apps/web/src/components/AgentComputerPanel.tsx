"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filterWorkEvents } from "@/lib/events/workEvents";
import { MissionGraphView } from "@/components/MissionGraphView";

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
  missionId?: string | null;
  preferOpen?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolLabel(ev: AgentEvent): string {
  const tool = typeof ev.payload?.tool === "string" ? ev.payload.tool : null;
  if (tool) {
    if (tool === "filesystem") return "Filesystem";
    if (tool === "note") return "Note";
    if (tool === "github") return "GitHub";
    if (tool === "vercel") return "Vercel";
    return tool.charAt(0).toUpperCase() + tool.slice(1);
  }
  if (ev.type === "action") return "Ação";
  if (ev.type === "observation") return "Resultado";
  if (ev.type === "plan") return "Plano";
  if (ev.type === "state_update") return "Estado";
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
  if (ev.type === "plan") return `Plano · ${ev.preview.slice(0, 120)}`;
  if (ev.type === "state_update") return `Estado · ${ev.preview.slice(0, 120)}`;
  return ev.preview.slice(0, 140);
}

function focusEvent(events: AgentEvent[]): AgentEvent | null {
  if (events.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "observation") return e;
  }
  return events[events.length - 1] ?? null;
}

/**
 * G3 — Computador do agente: só trabalho (action/observation/plan/state_update).
 * Chat messages ficam fora. SSE retoma via ?cursor= / Last-Event-ID no server.
 */
export function AgentComputerPanel({ conversationId, missionId, preferOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [missionGraph, setMissionGraph] = useState<unknown>(null);
  const [missionGraphRuntime, setMissionGraphRuntime] = useState<unknown>(null);
  const [specialistProfiles, setSpecialistProfiles] = useState<Array<{ id: string; label: string }>>([]);
  const [missionJobStatus, setMissionJobStatus] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "idle" | "live" | "replay" | "error"
  >("idle");
  const esRef = useRef<EventSource | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (preferOpen) setOpen(true);
  }, [preferOpen]);

  useEffect(() => {
    if (!missionId) {
      setMissionGraph(null);
      setMissionGraphRuntime(null);
      setSpecialistProfiles([]);
      setMissionJobStatus(null);
      return;
    }
    if (!open) return;

    let cancelled = false;
    const refreshMissionGraph = async () => {
      try {
        const [planResponse, executionsResponse] = await Promise.all([
          fetch(`/api/missions/${missionId}/plan`, { cache: "no-store" }),
          fetch(`/api/missions/${missionId}/executions`, { cache: "no-store" }),
        ]);
        const planData = planResponse.ok ? asRecord(await planResponse.json()) : null;
        const executionsData = executionsResponse.ok
          ? asRecord(await executionsResponse.json())
          : null;
        const executionRows = Array.isArray(executionsData?.executions)
          ? executionsData.executions
          : [];
        const currentExecution =
          asRecord(executionsData?.recoverable) ?? asRecord(executionRows[0]);
        const checkpoint = asRecord(currentExecution?.checkpoint);
        const runtimeJob = asRecord(executionsData?.runtimeJob);
        if (cancelled) return;
        setMissionGraph(planData?.graph ?? null);
        setMissionGraphRuntime(checkpoint?.missionGraphRuntime ?? null);
        setSpecialistProfiles(
          Array.isArray(planData?.specialistProfiles)
            ? planData.specialistProfiles.filter(
                (profile: unknown): profile is { id: string; label: string } =>
                  typeof profile === "object" &&
                  profile !== null &&
                  typeof (profile as { id?: unknown }).id === "string" &&
                  typeof (profile as { label?: unknown }).label === "string"
              )
            : []
        );
        setMissionJobStatus(typeof runtimeJob?.status === "string" ? runtimeJob.status : null);
      } catch {
        if (cancelled) return;
        setMissionGraph(null);
        setMissionGraphRuntime(null);
        setSpecialistProfiles([]);
        setMissionJobStatus(null);
      }
    };

    void refreshMissionGraph();
    const interval = window.setInterval(() => void refreshMissionGraph(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [missionId, open]);

  const mergeEvents = useCallback((incoming: AgentEvent[]) => {
    const work = filterWorkEvents(incoming);
    if (work.length === 0) return;
    setEvents((prev) => {
      const bySeq = new Map<number, AgentEvent>();
      for (const e of prev) bySeq.set(e.seq, e);
      for (const e of work) bySeq.set(e.seq, e);
      const next = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
      if (next.length) lastSeqRef.current = next[next.length - 1]!.seq;
      return next;
    });
  }, []);

  const connectStream = useCallback(
    (id: string, fromSeq: number) => {
      esRef.current?.close();
      const q = fromSeq > 0 ? `?cursor=${fromSeq}` : "";
      const es = new EventSource(
        `/api/conversations/${id}/events/stream${q}`
      );
      esRef.current = es;

      es.addEventListener("event", (msg) => {
        try {
          const ev = JSON.parse((msg as MessageEvent).data) as AgentEvent;
          if (!ev || typeof ev.seq !== "number") return;
          mergeEvents([ev]);
          setStreamStatus("live");
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("error", () => {
        setStreamStatus((s) => (s === "replay" ? s : "error"));
        es.close();
        if (esRef.current === es) esRef.current = null;
        if (reconnectTimerRef.current != null) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          if (esRef.current) return;
          connectStream(id, lastSeqRef.current);
        }, 2000);
      });
    },
    [mergeEvents]
  );

  useEffect(() => {
    if (!conversationId) {
      setEvents([]);
      setCursorIndex(null);
      setStreamStatus("idle");
      lastSeqRef.current = 0;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
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
        const list = Array.isArray(data.events)
          ? (data.events as AgentEvent[])
          : [];
        mergeEvents(list);
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        connectStream(conversationId, lastSeqRef.current);
      }
    })();

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [conversationId, mergeEvents, connectStream]);

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
    () => [...visibleEvents].reverse().slice(0, 8),
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
            Computador ·{" "}
            {isLive ? "ao vivo" : `replay #${viewIndex + 1}/${events.length}`}
          </p>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {focus ? activityLine(focus) : "Aguardando trabalho do agente"}
          </p>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
          {streamStatus === "live" ? "●" : streamStatus === "replay" ? "◆" : "○"}{" "}
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-[var(--border)]/60 px-3 pb-3 pt-2 space-y-3">
          {missionGraph ? (
            <MissionGraphView
              graph={missionGraph}
              runtime={missionGraphRuntime}
              jobStatus={missionJobStatus}
              compact
              specialistProfiles={specialistProfiles}
            />
          ) : null}
          <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--base)]/40 p-2.5 min-h-[72px]">
            <p className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1">
              Tela
            </p>
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
              <p className="text-xs text-[var(--text-muted)] italic">
                Sem foco de trabalho ainda.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
              Atividade
            </p>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">
                Nenhum passo de trabalho.
              </p>
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
              disabled={
                events.length === 0 || (isLive && viewIndex >= events.length - 1)
              }
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
              {events.length} steps
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
