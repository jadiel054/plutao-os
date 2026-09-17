"use client";

import { useState } from "react";
import type { MissionEvent, MissionPlanV1, MissionStep } from "@plutao/domain";
import { isStepInFailureLoop } from "@plutao/domain";

function formatAt(at: string): string {
  try {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at;
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return at;
  }
}

export function MissionExecutionView({
  plan,
  onInspect,
  onFix,
  onTest,
  onStop,
  busy,
}: {
  plan: MissionPlanV1;
  onInspect?: (step: MissionStep) => void;
  onFix?: (step: MissionStep) => void;
  onTest?: (step: MissionStep) => void;
  onStop?: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const events = [...plan.events].reverse().slice(0, 40);
  const active =
    plan.steps.find((s) => s.id === plan.steps[plan.currentStepIndex]?.id) ??
    plan.steps.find((s) => isStepInFailureLoop(s.status) || s.status === "RUNNING");

  const toolCount = plan.events.filter((e) => e.kind === "tool").length;
  const failCount = plan.events.filter((e) => e.kind === "step_failed").length;
  const stopped = plan.events.some((e) => e.kind === "stopped");

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)]">
            View · execução
          </p>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {stopped
              ? "Parada pelo usuário"
              : active
                ? `${active.title} · ${active.status}`
                : "Aguardando execução"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-[var(--text-muted)]">
          <span>{toolCount} tools</span>
          {failCount > 0 ? <span className="text-red-400">{failCount} falhas</span> : null}
          <span>{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open ? (
        <div className="border-t border-[var(--border)]/60 px-3 pb-3 pt-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            {onStop ? (
              <button
                type="button"
                disabled={busy || stopped}
                onClick={onStop}
                className="px-2.5 py-1 rounded-lg border border-red-500/40 text-red-300 text-[11px] disabled:opacity-40"
              >
                Parar missão
              </button>
            ) : null}
          </div>

          {active && isStepInFailureLoop(active.status) ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 space-y-2">
              <p className="text-xs text-red-300 font-medium">
                Passo bloqueado — ciclo de correção obrigatório
              </p>
              {active.failureCause ? (
                <p className="text-[11px] text-red-200/90">
                  Causa: {active.failureCause}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {active.status === "FAILED" && onInspect ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInspect(active)}
                    className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] disabled:opacity-40"
                  >
                    Inspecionar
                  </button>
                ) : null}
                {active.status === "INSPECTING" && onFix ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onFix(active)}
                    className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] disabled:opacity-40"
                  >
                    Corrigir
                  </button>
                ) : null}
                {active.status === "FIXING" && onTest ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTest(active)}
                    className="px-2.5 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40"
                  >
                    Testar
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {events.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic py-1">
              Nenhuma ação registrada ainda.
            </p>
          ) : (
            <ul className="max-h-40 overflow-y-auto space-y-1.5">
              {events.map((ev: MissionEvent) => (
                <li
                  key={ev.id}
                  className="flex gap-2 text-[11px] leading-snug"
                >
                  <span className="font-mono text-[var(--text-muted)] shrink-0 w-14">
                    {formatAt(ev.at)}
                  </span>
                  <span className="text-[var(--text-primary)] min-w-0">
                    <span className="text-[var(--text-muted)] font-mono mr-1">
                      {ev.kind}
                    </span>
                    {ev.label}
                    {ev.detail ? (
                      <span className="block text-[var(--text-secondary)] truncate">
                        {ev.detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
