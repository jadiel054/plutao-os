"use client";

import type { MissionPlanV1, MissionStep, MissionStepStatus } from "@plutao/domain";
import { countPassedSteps, isStepInFailureLoop } from "@plutao/domain";

const LIVE: MissionStepStatus[] = [
  "RUNNING",
  "INSPECTING",
  "FIXING",
  "TESTING",
];

function motionClass(plan: MissionPlanV1): string {
  const total = plan.steps.length;
  const passed = countPassedSteps(plan);
  const hasFail = plan.steps.some(
    (s) => s.status === "FAILED" || s.status === "INSPECTING"
  );
  const hasLive = plan.steps.some((s) => LIVE.includes(s.status));
  const allDone = total > 0 && passed === total;
  const stopped = plan.events.some((e) => e.kind === "stopped");

  const parts = ["mission-motion", "rounded-2xl", "border", "border-[var(--border)]"];

  if (stopped) {
    /* neutro */
  } else if (hasFail) {
    parts.push("mission-motion--failed");
  } else if (hasLive) {
    parts.push("mission-motion--executing");
  } else if (allDone) {
    parts.push("mission-motion--complete");
  }

  const last = plan.events[plan.events.length - 1];
  if (last?.kind === "step_passed") {
    parts.push("mission-motion--passed-flash");
  }

  return parts.join(" ");
}

function StepMarker({ status }: { status: MissionStepStatus }) {
  if (LIVE.includes(status)) {
    return (
      <span className="w-4 shrink-0 flex items-center justify-center" aria-hidden>
        <span className="mission-step-dot" />
      </span>
    );
  }
  if (status === "PASSED") {
    return (
      <span className="font-mono text-sm w-4 shrink-0 text-[var(--success)]" aria-hidden>
        ✓
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="font-mono text-sm w-4 shrink-0 text-[var(--danger)]" aria-hidden>
        ✕
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="font-mono text-sm w-4 shrink-0 text-[var(--text-muted)]" aria-hidden>
        —
      </span>
    );
  }
  if (status === "BLOCKED") {
    return (
      <span className="font-mono text-sm w-4 shrink-0 text-amber-500/80" aria-hidden>
        ▣
      </span>
    );
  }
  /* PENDING */
  return (
    <span
      className="w-4 shrink-0 flex items-center justify-center"
      aria-hidden
    >
      <span className="w-3 h-3 rounded-full border border-[var(--mid)]" />
    </span>
  );
}

const STATUS_CLASS: Record<MissionStepStatus, string> = {
  PENDING: "text-[var(--text-muted)]",
  RUNNING: "text-[var(--nucleo)] font-semibold",
  PASSED: "text-[var(--success)]",
  FAILED: "text-[var(--text-primary)]",
  INSPECTING: "text-amber-400",
  FIXING: "text-amber-300",
  TESTING: "text-[var(--nucleo)]",
  BLOCKED: "text-amber-500/80",
  CANCELLED: "text-[var(--text-muted)] line-through",
};

function StepRow({
  step,
  locked,
}: {
  step: MissionStep;
  locked: boolean;
}) {
  const inLoop = isStepInFailureLoop(step.status);
  return (
    <li
      className={`flex items-start gap-2 py-1.5 ${locked ? "opacity-40" : ""}`}
    >
      <StepMarker status={step.status} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs leading-snug ${STATUS_CLASS[step.status]}`}>
          {step.title}
        </div>
        {step.status === "FAILED" && step.failureCause ? (
          <p className="mt-0.5 text-[10px] text-red-400/90 leading-relaxed">
            Causa: {step.failureCause}
          </p>
        ) : null}
        {inLoop && step.status !== "FAILED" ? (
          <p className="mt-0.5 text-[10px] text-amber-400/80 font-mono uppercase tracking-wide">
            {step.status === "INSPECTING"
              ? "Inspecionar"
              : step.status === "FIXING"
                ? "Corrigir"
                : "Testar"}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function MissionPlanner({
  plan,
  missionObjective,
  onAlign,
  aligning,
  compact,
}: {
  plan: MissionPlanV1;
  missionObjective?: string;
  onAlign?: () => void;
  aligning?: boolean;
  compact?: boolean;
}) {
  const passed = countPassedSteps(plan);
  const total = plan.steps.length;
  const activeIdx = plan.currentStepIndex;

  return (
    <div className={`${motionClass(plan)} bg-[var(--surface)]/80 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-2 mb-2 relative z-[1]">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)]">
            Planejamento
          </p>
          {missionObjective ? (
            <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
              {missionObjective}
            </p>
          ) : null}
        </div>
        <span className="text-xs font-mono text-[var(--selo)] shrink-0">
          {passed}/{total}
        </span>
      </div>

      {!plan.aligned ? (
        <div className="mb-3 rounded-xl border border-[var(--selo)]/30 bg-[var(--selo)]/10 px-3 py-2 text-xs relative z-[1]">
          <p className="text-[var(--text-secondary)] mb-2">
            Plano aguardando alinhamento. Confirme para liberar a execução.
          </p>
          {onAlign ? (
            <button
              type="button"
              disabled={aligning}
              onClick={onAlign}
              className="px-3 py-1.5 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold disabled:opacity-40"
            >
              {aligning ? "Confirmando…" : "Alinhar e seguir"}
            </button>
          ) : null}
        </div>
      ) : null}

      {total === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic relative z-[1]">
          Nenhum passo no plano ainda.
        </p>
      ) : (
        <ol className="space-y-0 relative z-[1]">
          {plan.steps.map((step, i) => {
            const locked =
              plan.aligned &&
              i > 0 &&
              plan.steps.slice(0, i).some((s) => s.status !== "PASSED") &&
              step.status === "PENDING";
            return (
              <StepRow
                key={step.id}
                step={step}
                locked={locked && i !== activeIdx}
              />
            );
          })}
        </ol>
      )}
    </div>
  );
}
