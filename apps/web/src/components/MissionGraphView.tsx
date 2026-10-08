"use client";

import React from "react";
import { validateMissionGraphV2 } from "@plutao/domain";
import type { MissionGraphNodeV2 } from "@plutao/domain";

type RuntimeNodeState = {
  status: "PENDING" | "RUNNING" | "PASSED" | "FAILED";
  attempts: number;
  errorCode: string | null;
};

type RuntimeSnapshot = {
  activeNodeId: string | null;
  nodes: Record<string, RuntimeNodeState>;
};

const STATUS_COPY: Record<RuntimeNodeState["status"], string> = {
  PENDING: "Aguardando",
  RUNNING: "Em execução",
  PASSED: "Concluído",
  FAILED: "Falhou",
};

const STATUS_STYLE: Record<RuntimeNodeState["status"], string> = {
  PENDING: "border-[var(--border)] bg-[var(--surface)]/50 text-[var(--text-muted)]",
  RUNNING: "border-[var(--nucleo)]/50 bg-[var(--nucleo)]/10 text-[var(--nucleo)]",
  PASSED: "border-[var(--success)]/35 bg-[var(--success)]/8 text-[var(--success)]",
  FAILED: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRuntime(value: unknown): RuntimeSnapshot | null {
  if (!isRecord(value) || value.version !== 2 || value.mode !== "serial" || !isRecord(value.nodes)) {
    return null;
  }
  const nodes: Record<string, RuntimeNodeState> = {};
  for (const [id, raw] of Object.entries(value.nodes)) {
    if (!isRecord(raw)) return null;
    const status = raw.status;
    if (status !== "PENDING" && status !== "RUNNING" && status !== "PASSED" && status !== "FAILED") {
      return null;
    }
    const attempts = Number(raw.attempts);
    if (!Number.isInteger(attempts) || attempts < 0) return null;
    nodes[id] = {
      status,
      attempts,
      errorCode: typeof raw.errorCode === "string" ? raw.errorCode : null,
    };
  }
  return {
    activeNodeId: typeof value.activeNodeId === "string" ? value.activeNodeId : null,
    nodes,
  };
}

function kindLabel(kind: string): string {
  if (kind === "approval") return "Aprovação";
  if (kind === "verification") return "Verificação";
  return "Trabalho";
}

function topologicalDisplayOrder(nodes: MissionGraphNodeV2[]): MissionGraphNodeV2[] | null {
  const indegree = new Map(nodes.map((node) => [node.id, node.dependsOn.length]));
  const ready = nodes.filter((node) => indegree.get(node.id) === 0);
  const ordered: MissionGraphNodeV2[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    ordered.push(current);
    for (const child of nodes) {
      if (!child.dependsOn.includes(current.id)) continue;
      const degree = (indegree.get(child.id) ?? 0) - 1;
      indegree.set(child.id, degree);
      if (degree === 0) {
        const insertionIndex = ready.findIndex(
          (candidate) => nodes.indexOf(candidate) > nodes.indexOf(child)
        );
        if (insertionIndex < 0) ready.push(child);
        else ready.splice(insertionIndex, 0, child);
      }
    }
  }
  return ordered.length === nodes.length ? ordered : null;
}

export function MissionGraphView({
  graph: rawGraph,
  runtime: rawRuntime,
  jobStatus,
  compact = false,
  specialistProfiles = [],
  specialistsEditable = false,
  specialistsBusy = false,
  onSpecialistChange,
}: {
  graph: unknown;
  runtime?: unknown;
  jobStatus?: string | null;
  compact?: boolean;
  specialistProfiles?: Array<{ id: string; label: string }>;
  specialistsEditable?: boolean;
  specialistsBusy?: boolean;
  onSpecialistChange?: (nodeId: string, specialistProfileId: string | null) => void;
}) {
  const validated = validateMissionGraphV2(rawGraph);
  if (!validated.ok) return null;
  const orderedNodes = topologicalDisplayOrder(validated.graph.nodes);
  if (!orderedNodes) return null;

  const runtime = readRuntime(rawRuntime);
  const nodeById = new Map(orderedNodes.map((node) => [node.id, node]));
  const completedCount = orderedNodes.filter(
    (node) => runtime?.nodes[node.id]?.status === "PASSED"
  ).length;
  const gridClass = compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <section className="rounded-xl border border-[var(--border)]/80 bg-[var(--base)]/35 p-2.5 space-y-2.5" aria-label="Grafo da missão">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)]">
          Grafo V2 · execução serial
        </p>
        <span className="ml-auto text-[10px] text-[var(--text-secondary)]">
          {completedCount}/{orderedNodes.length} nós concluídos
        </span>
      </div>
      {jobStatus === "WAITING_APPROVAL" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          Aguardando decisão humana; o worker retomará a missão após a decisão.
        </p>
      ) : null}
      <ol className={`grid ${gridClass} gap-2`}>
        {orderedNodes.map((node, index) => {
          const state = runtime?.nodes[node.id];
          const status = state?.status ?? "PENDING";
          const assignedProfile = specialistProfiles.find((profile) => profile.id === node.specialistProfileId);
          return (
            <li key={node.id} className={`min-w-0 rounded-lg border p-2.5 ${STATUS_STYLE[status]}`}>
              <div className="flex items-start gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-current/30 text-[10px] font-mono">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-snug break-words">{node.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] opacity-85">
                    <span>{kindLabel(node.kind)}</span>
                    <span>{STATUS_COPY[status]}</span>
                    {state && state.attempts > 0 ? <span>tentativa {state.attempts}</span> : null}
                  </div>
                  {specialistsEditable && onSpecialistChange ? (
                    <label className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                      <span>Especialista</span>
                      <select
                        aria-label={`Especialista do nó ${node.title}`}
                        value={node.specialistProfileId ?? ""}
                        disabled={specialistsBusy}
                        onChange={(event) => onSpecialistChange(node.id, event.target.value || null)}
                        className="min-w-0 max-w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 py-1 text-[10px] text-[var(--text-primary)] disabled:opacity-50"
                      >
                        <option value="">Perfil padrão</option>
                        {specialistProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : node.specialistProfileId ? (
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                      Especialista: {assignedProfile?.label ?? node.specialistProfileId.replaceAll("_", " ")}
                    </p>
                  ) : null}
                </div>
              </div>
              {node.dependsOn.length > 0 ? (
                <div className="mt-2 border-t border-current/15 pt-1.5">
                  <p className="text-[9px] uppercase tracking-wide opacity-65">Depende de</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {node.dependsOn.map((dependencyId) => (
                      <span key={dependencyId} className="max-w-full truncate rounded-md border border-current/20 px-1.5 py-0.5 text-[10px]" title={nodeById.get(dependencyId)?.title ?? dependencyId}>
                        {nodeById.get(dependencyId)?.title ?? dependencyId}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {state?.errorCode ? (
                <p className="mt-1.5 break-words text-[10px] opacity-85">Código: {state.errorCode}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
