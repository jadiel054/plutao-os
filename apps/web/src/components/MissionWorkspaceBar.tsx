"use client";

import { useCallback, useEffect, useState } from "react";
import type { MissionPlanV1, MissionStep } from "@plutao/domain";
import { parseMissionPlan } from "@plutao/domain";
import { MissionPlanner } from "@/components/MissionPlanner";
import { MissionExecutionView } from "@/components/MissionExecutionView";

/**
 * Barra de Mission Workspace acima do input do chat.
 * Carrega plano da missão ativa e permite alinhar / ciclar falha.
 */
export function MissionWorkspaceBar({
  missionId,
  onNotify,
}: {
  missionId: string | null;
  onNotify?: (msg: string, type?: "info" | "success" | "error") => void;
}) {
  const [plan, setPlan] = useState<MissionPlanV1 | null>(null);
  const [objective, setObjective] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!missionId) {
      setPlan(null);
      setObjective("");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/plan`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlan(null);
        return;
      }
      setObjective(String(data.objective ?? ""));
      setPlan(parseMissionPlan(data.plan));
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!missionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(
          typeof data.error === "string" ? data.error : "Falha na ação do plano",
          "error"
        );
        return;
      }
      const next = parseMissionPlan(data.plan);
      if (next) setPlan(next);
      onNotify?.("Plano atualizado", "success");
    } catch {
      onNotify?.("Erro de rede ao atualizar plano", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!missionId) return null;

  if (loading && !plan) {
    return (
      <div className="text-[10px] font-mono text-[var(--text-muted)] px-1 py-2">
        Carregando workspace…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Missão ativa sem plano estruturado. Crie o plano no Cockpit ou via API
        create_plan.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MissionPlanner
        plan={plan}
        missionObjective={objective}
        compact
        aligning={busy}
        onAlign={
          plan.aligned
            ? undefined
            : () => void patch({ action: "align" })
        }
      />
      <MissionExecutionView
        plan={plan}
        busy={busy}
        onInspect={(step: MissionStep) =>
          void patch({
            action: "transition",
            stepId: step.id,
            toStatus: "INSPECTING",
            eventLabel: `Inspecionar: ${step.title}`,
          })
        }
        onFix={(step: MissionStep) =>
          void patch({
            action: "transition",
            stepId: step.id,
            toStatus: "FIXING",
            eventLabel: `Corrigir: ${step.title}`,
          })
        }
        onTest={(step: MissionStep) =>
          void patch({
            action: "transition",
            stepId: step.id,
            toStatus: "TESTING",
            eventLabel: `Testar: ${step.title}`,
          })
        }
        onStop={() =>
          void patch({
            action: "append_event",
            kind: "stopped",
            label: "Execução interrompida pelo usuário",
          })
        }
      />
    </div>
  );
}
