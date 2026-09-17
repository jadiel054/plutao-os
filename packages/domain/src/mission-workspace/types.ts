/**
 * Mission Workspace V1 — plan steps + execution trail + failure gate
 *
 * Rule: no step N+1 starts until step N is PASSED.
 * Failure opens mandatory loop: FAILED → INSPECTING → FIXING → TESTING → PASSED
 */

export type MissionStepStatus =
  | "PENDING"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "INSPECTING"
  | "FIXING"
  | "TESTING"
  | "BLOCKED"
  | "CANCELLED";

export type MissionEventKind =
  | "plan_created"
  | "aligned"
  | "step_started"
  | "step_passed"
  | "step_failed"
  | "inspect"
  | "fix"
  | "test"
  | "tool"
  | "artifact"
  | "note"
  | "stopped";

export type ChatIntent = "chat" | "mission" | "project" | "config";

export interface ProjectBrief {
  objective: string;
  constraints?: string | null;
  stackHints?: string[];
  openQuestions?: string[];
  decisions?: string[];
}

export interface MissionStep {
  id: string;
  index: number;
  title: string;
  description?: string | null;
  /** Definition of done for this step only */
  dod?: string | null;
  status: MissionStepStatus;
  failureCause?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
}

export interface MissionEvent {
  id: string;
  kind: MissionEventKind;
  label: string;
  detail?: string | null;
  stepId?: string | null;
  at: string;
}

export interface MissionPlanV1 {
  version: 1;
  aligned: boolean;
  brief?: ProjectBrief | null;
  steps: MissionStep[];
  events: MissionEvent[];
  currentStepIndex: number;
  createdAt: string;
  updatedAt: string;
}

/** Transitions allowed for a single step (failure gate). */
const STEP_TRANSITIONS: Record<MissionStepStatus, MissionStepStatus[]> = {
  PENDING: ["RUNNING", "CANCELLED", "BLOCKED"],
  RUNNING: ["PASSED", "FAILED", "CANCELLED"],
  PASSED: [], // terminal success — never goes back via normal advance
  FAILED: ["INSPECTING", "CANCELLED"],
  INSPECTING: ["FIXING", "CANCELLED"],
  FIXING: ["TESTING", "CANCELLED"],
  TESTING: ["PASSED", "FAILED", "CANCELLED"],
  BLOCKED: ["PENDING", "CANCELLED"],
  CANCELLED: [],
};

export function canTransitionStep(
  from: MissionStepStatus,
  to: MissionStepStatus
): boolean {
  return STEP_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Advance is only allowed when every step with index < targetIndex is PASSED,
 * and the step at targetIndex is the one being started (PENDING → RUNNING).
 */
export function canStartStep(plan: MissionPlanV1, stepIndex: number): boolean {
  if (stepIndex < 0 || stepIndex >= plan.steps.length) return false;
  for (let i = 0; i < stepIndex; i++) {
    if (plan.steps[i].status !== "PASSED") return false;
  }
  const step = plan.steps[stepIndex];
  return step.status === "PENDING" || step.status === "BLOCKED";
}

export function isStepInFailureLoop(status: MissionStepStatus): boolean {
  return (
    status === "FAILED" ||
    status === "INSPECTING" ||
    status === "FIXING" ||
    status === "TESTING"
  );
}

export function countPassedSteps(plan: MissionPlanV1): number {
  return plan.steps.filter((s) => s.status === "PASSED").length;
}

export function getActiveStep(plan: MissionPlanV1): MissionStep | null {
  const idx = plan.currentStepIndex;
  if (idx < 0 || idx >= plan.steps.length) return null;
  return plan.steps[idx] ?? null;
}

export function createEmptyPlan(brief?: ProjectBrief | null): MissionPlanV1 {
  const now = new Date().toISOString();
  return {
    version: 1,
    aligned: false,
    brief: brief ?? null,
    steps: [],
    events: [],
    currentStepIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createPlanFromTitles(
  titles: string[],
  brief?: ProjectBrief | null
): MissionPlanV1 {
  const now = new Date().toISOString();
  const steps: MissionStep[] = titles.map((title, index) => ({
    id: crypto.randomUUID(),
    index,
    title,
    status: "PENDING" as const,
    failureCause: null,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }));
  return {
    version: 1,
    aligned: false,
    brief: brief ?? null,
    steps,
    events: [
      {
        id: crypto.randomUUID(),
        kind: "plan_created",
        label: "Plano criado",
        detail: `${steps.length} passo(s)`,
        at: now,
      },
    ],
    currentStepIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseMissionPlan(raw: unknown): MissionPlanV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1 || !Array.isArray(p.steps)) return null;
  return raw as MissionPlanV1;
}

/**
 * Apply a step status transition with failure-gate enforcement.
 * Returns null if illegal.
 */
export function applyStepTransition(
  plan: MissionPlanV1,
  stepId: string,
  nextStatus: MissionStepStatus,
  opts?: { failureCause?: string | null; eventLabel?: string; eventDetail?: string }
): MissionPlanV1 | null {
  const stepIndex = plan.steps.findIndex((s) => s.id === stepId);
  if (stepIndex < 0) return null;
  const step = plan.steps[stepIndex];
  if (!canTransitionStep(step.status, nextStatus)) return null;

  // Starting RUNNING requires all previous PASSED
  if (nextStatus === "RUNNING" && !canStartStep(plan, stepIndex)) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedSteps = plan.steps.map((s, i) => {
    if (i !== stepIndex) return s;
    return {
      ...s,
      status: nextStatus,
      failureCause:
        nextStatus === "FAILED"
          ? opts?.failureCause ?? s.failureCause ?? "Falha sem causa registrada"
          : nextStatus === "PASSED"
            ? null
            : s.failureCause,
      startedAt: nextStatus === "RUNNING" ? now : s.startedAt,
      completedAt: nextStatus === "PASSED" ? now : s.completedAt,
      updatedAt: now,
    };
  });

  const kind: MissionEventKind =
    nextStatus === "RUNNING"
      ? "step_started"
      : nextStatus === "PASSED"
        ? "step_passed"
        : nextStatus === "FAILED"
          ? "step_failed"
          : nextStatus === "INSPECTING"
            ? "inspect"
            : nextStatus === "FIXING"
              ? "fix"
              : nextStatus === "TESTING"
                ? "test"
                : "note";

  const event: MissionEvent = {
    id: crypto.randomUUID(),
    kind,
    label:
      opts?.eventLabel ??
      `${step.title}: ${nextStatus}`,
    detail: opts?.eventDetail ?? opts?.failureCause ?? null,
    stepId,
    at: now,
  };

  let currentStepIndex = plan.currentStepIndex;
  if (nextStatus === "RUNNING") currentStepIndex = stepIndex;
  if (nextStatus === "PASSED") {
    // point to next pending if any
    const next = updatedSteps.findIndex(
      (s, i) => i > stepIndex && s.status === "PENDING"
    );
    if (next >= 0) currentStepIndex = next;
  }

  return {
    ...plan,
    steps: updatedSteps,
    events: [...plan.events, event],
    currentStepIndex,
    updatedAt: now,
  };
}
