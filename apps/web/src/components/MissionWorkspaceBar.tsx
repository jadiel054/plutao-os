"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionPlanV1, MissionStep } from "@plutao/domain";
import { parseMissionPlan } from "@plutao/domain";
import { MissionPlanner } from "@/components/MissionPlanner";
import { MissionExecutionView } from "@/components/MissionExecutionView";

/**
 * Barra de Mission Workspace acima do input do chat.
 * Carrega plano da missão ativa e permite alinhar / ciclar falha / stop real (1.3).
 * H1: após align bem-sucedido, dispara POST /api/missions/:id/autonomous-run
 * (mesmo path do Cockpit — execução real, não só status EXECUTING).
 * Poll 2.5s para trail de tools ao vivo (1.1).
 */
export function MissionWorkspaceBar({
  missionId,
  onNotify,
}: {
  missionId: string | null;
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
   * H1: align e autonomous-run são requests separados.
   * O loop NÃO roda no PATCH align (evita timeout no align).
   * autonomous-run usa maxDuration=300 no route; missões longas ainda
   * podem cortar — ver débito de executor durável no PR.
   */
  async function handleAlign() {
    if (!missionId) return;
    const aligned = await patch({ action: "align" });
    if (!aligned) return;

    onNotifyRef.current?.("Plano alinhado — iniciando execução…", "info");
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/autonomous-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.message === "string"
            ? data.message
            : typeof data.error === "string"
              ? data.error
              : "Falha ao iniciar execução autônoma";
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
        "Erro de rede ao iniciar execução. O plano permanece alinhado — tente de novo pelo Cockpit.",
        "error"
      );
      await load(true);
    } finally {
      setBusy(false);
    }
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
