"use client";

export type TimelineEvent = {
  id: string;
  kind: "created" | "status" | "task" | "execution" | "evidence" | "checkpoint";
  label: string;
  detail?: string;
  at?: string | null;
  tone?: "neutral" | "active" | "success" | "warning" | "danger";
};

const TONE_DOT: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  neutral: "bg-[var(--text-muted)]",
  active: "bg-[var(--nucleo)]",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
};

const TONE_BORDER: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  neutral: "border-[var(--border)]",
  active: "border-[var(--selo)]",
  success: "border-emerald-500/40",
  warning: "border-amber-500/40",
  danger: "border-red-500/40",
};

function formatAt(at?: string | null): string {
  if (!at) return "";
  try {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return at;
  }
}

function statusTone(status: string): TimelineEvent["tone"] {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "success";
  if (s === "FAILED" || s === "CANCELLED") return "danger";
  if (s === "BLOCKED") return "warning";
  if (s === "EXECUTING" || s === "VERIFYING" || s === "RUNNING") return "active";
  return "neutral";
}

export function buildMissionTimeline(input: {
  missionId: string;
  objective: string;
  status: string;
  createdAt?: string | null;
  tasks: { id: string; title: string; status: string }[];
  execution: {
    id: string;
    status: string;
    checkpoint: Record<string, unknown> | null;
    checkpointAt: string | null;
  } | null;
  evidence: {
    id: string;
    type: string;
    content: string;
    source: string;
    createdAt?: string;
  }[];
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: `created-${input.missionId}`,
    kind: "created",
    label: "Missão criada",
    detail: input.objective.slice(0, 120),
    at: input.createdAt,
    tone: "neutral",
  });

  events.push({
    id: `status-${input.missionId}-${input.status}`,
    kind: "status",
    label: `Status: ${input.status}`,
    detail: "Estado atual da missão",
    tone: statusTone(input.status),
  });

  if (input.execution) {
    events.push({
      id: `exec-${input.execution.id}`,
      kind: "execution",
      label: `Runtime: ${input.execution.status}`,
      detail: `execution ${input.execution.id.slice(0, 8)}…`,
      at: input.execution.checkpointAt,
      tone: statusTone(input.execution.status),
    });

    if (input.execution.checkpoint && Object.keys(input.execution.checkpoint).length > 0) {
      const step =
        typeof input.execution.checkpoint.step === "string"
          ? input.execution.checkpoint.step
          : "checkpoint";
      events.push({
        id: `cp-${input.execution.id}`,
        kind: "checkpoint",
        label: `Checkpoint: ${step}`,
        detail: JSON.stringify(input.execution.checkpoint).slice(0, 160),
        at: input.execution.checkpointAt,
        tone: "active",
      });
    }
  }

  for (const t of input.tasks) {
    events.push({
      id: `task-${t.id}`,
      kind: "task",
      label: t.title,
      detail: `Tarefa · ${t.status}`,
      tone: statusTone(t.status),
    });
  }

  for (const e of input.evidence) {
    events.push({
      id: `ev-${e.id}`,
      kind: "evidence",
      label: `${e.source || "evidence"} · ${e.type || "item"}`,
      detail: e.content.slice(0, 160),
      at: e.createdAt,
      tone: "success",
    });
  }

  return events;
}

export function MissionTimeline({
  events,
  emptyLabel = "Nenhum evento ainda. Abra a missão e execute passos para ver a timeline.",
}: {
  events: TimelineEvent[];
  emptyLabel?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] italic py-2">{emptyLabel}</p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-[var(--border)] ml-2 pl-4">
      {events.map((ev) => {
        const tone = ev.tone ?? "neutral";
        return (
          <li key={ev.id} className="relative pb-4 last:pb-0">
            <span
              className={`absolute -left-[1.28rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--base)] ${TONE_DOT[tone]}`}
              aria-hidden
            />
            <div
              className={`rounded-xl border bg-[var(--surface)]/60 px-3 py-2 ${TONE_BORDER[tone]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                  {ev.label}
                </span>
                {ev.at ? (
                  <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                    {formatAt(ev.at)}
                  </span>
                ) : null}
              </div>
              {ev.detail ? (
                <p className="mt-1 text-[11px] text-[var(--text-secondary)] leading-relaxed break-words">
                  {ev.detail}
                </p>
              ) : null}
              <span className="mt-1 inline-block text-[9px] font-mono uppercase tracking-wide text-[var(--text-muted)]">
                {ev.kind}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
