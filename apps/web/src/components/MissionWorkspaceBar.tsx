"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionPlanV1, MissionStep } from "@plutao/domain";
import { parseMissionPlan } from "@plutao/domain";
import { MissionPlanner } from "@/components/MissionPlanner";
import { MissionExecutionView } from "@/components/MissionExecutionView";

/**
 * Barra de Mission Workspace acima do input do chat.
 * G3: autonomous-run é fire-and-forget (não bloqueia UI até 5 min).
 * conversationId liga o runtime ao event stream do Computador.
 */
export function MissionWorkspaceBar({
  missionId,
  conversationId,
  onNotify,
}: {
  missionId: string | null;
  conversationId?: string | null;
  onNotify?: (msg: string, type?: "info" | "success" | "error") => void;
}) {
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  });

  const [plan, setPlan] = useState<MissionPlanV1 | null>(null);
  const [objective, setObjective] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (isSilent = false) => {
    if (!missionId) {
      setPlan(null);
      setObjective("");
      return;
    }
    if (!isSilent) setLoading(true);
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
      if (!isSilent) setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!missionId) return;
    const id = window.setInterval(() => {
      void load(true);
    }, 2500);
    return () => window.clearInterval(id);
  }, [missionId, load]);

  async function patch(body: Record<string, unknown>) {
    if (!missionId) return null;
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotifyRef.current?.(
          typeof data.error === "string" ? data.error : "Falha na ação do plano",
          "error"
        );
        return null;
      }
      const next = parseMissionPlan(data.plan);
      if (next) setPlan(next);
      return data;
    } catch {
      onNotifyRef.current?.("Erro de rede ao atualizar plano", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Align (rápido) + dispara autonomous-run sem await longo.
   * O painel Computador acompanha via SSE; poll do plano continua.
   */
  async function handleAlign() {
    if (!missionId) return;
    const aligned = await patch({ action: "align" });
    if (!aligned) return;

    onNotifyRef.current?.(
      "Plano alinhado — execução iniciada em segundo plano",
      "info"
    );

    // Fire-and-forget: não segura a UI nos maxDuration 300s
    void (async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/autonomous-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof data.message === "string"
              ? data.message
              : typeof data.error === "string"
                ? data.error
                : "Falha na execução autônoma";
          onNotifyRef.current?.(msg, "error");
          await load(true);
          return;
        }
        onNotifyRef.current?.(
          typeof data.message === "string"
            ? data.message
            : "Execução concluída",
          data.ok ? "success" : "error"
        );
        await load(true);
      } catch {
        onNotifyRef.current?.(
          "Erro de rede na execução. Plano permanece alinhado.",
          "error"
        );
        await load(true);
      }
    })();
  }

  async function stopMission() {
    if (!missionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Parado pelo usuário" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotifyRef.current?.(
          typeof data.error === "string" ? data.error : "Falha ao parar missão",
          "error"
        );
        return;
      }
      const next = parseMissionPlan(data.plan);
      if (next) setPlan(next);
      else await load();

      if (data.stoppedExecution) {
        onNotifyRef.current?.("Execução cancelada. Loop para na próxima iteração.", "success");
      } else if (data.noActiveRun) {
        onNotifyRef.current?.("Sem execução ativa — plano marcado como parado.", "info");
      } else {
        onNotifyRef.current?.("Missão parada", "success");
      }
    } catch {
      onNotifyRef.current?.("Erro de rede ao parar missão", "error");
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
        Missão ativa sem plano estruturado. Use o plano sugerido no chat ou o Cockpit.
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
          plan.aligned ? undefined : () => void handleAlign()
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
        onStop={() => void stopMission()}
      />
    </div>
  );
}
