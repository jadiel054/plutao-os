/** Client-side autonomous mission execution helpers */
export async function runAutonomousMission(opts: {
  missionId: string;
  status: string;
  execution: { id: string; status: string } | null;
  taskId: string | null;
  modelConfigured: boolean;
  onStatus: (s: string, allowed: string[]) => void;
  onExecution: (e: unknown) => void;
  onEvidence: (ev: unknown[]) => void;
  onError: (msg: string) => void;
  onToast: (msg: string, type: "success" | "error" | "warning") => void;
}): Promise<void> {
  const { missionId, modelConfigured, onStatus, onExecution, onEvidence, onError, onToast } = opts;
  if (!modelConfigured) {
    onToast("Configure MODEL_API_KEY no Vercel", "error");
    return;
  }
  let status = opts.status.toUpperCase();
  if (["COMPLETED", "CANCELLED", "FAILED"].includes(status)) {
    onToast("Missão já finalizada", "warning");
    return;
  }
  const path = ["UNDERSTANDING", "PLANNING", "EXECUTING"] as const;
  const order = ["CREATED", "UNDERSTANDING", "PLANNING", "EXECUTING"];
  for (const next of path) {
    if (status === "EXECUTING") break;
    if (status === next) continue;
    const i = order.indexOf(status);
    const j = order.indexOf(next);
    if (i < 0 || j <= i) continue;
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transition", toStatus: next }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      onError(d.error ?? `Falha → ${next}`);
      onToast(d.error ?? `Falha → ${next}`, "error");
      return;
    }
    status = String(d.mission?.status ?? next);
    onStatus(status, Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []);
  }
  let exec = opts.execution;
  if (!exec || !["RUNNING", "PAUSED", "WAITING"].includes(exec.status)) {
    const res = await fetch(`/api/missions/${missionId}/executions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentTaskId: opts.taskId }),
    });
    const d = await res.json();
    if (!res.ok) {
      onError(d.error ?? "Falha runtime");
      onToast(d.error ?? "Falha runtime", "error");
      return;
    }
    exec = d.execution;
    onExecution(exec);
  }
  if (!exec?.id) {
    onToast("Sem execution id", "error");
    return;
  }
  let stepsOk = 0;
  for (let step = 0; step < 5; step++) {
    const res = await fetch(`/api/executions/${exec.id}/model-step`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        d.error === "MODEL_NOT_CONFIGURED"
          ? "Configure MODEL_API_KEY no Vercel"
          : d.detail ?? d.error ?? "Falha no model-step";
      onError(errMsg);
      onToast(errMsg, "error");
      break;
    }
    stepsOk++;
    if (d.execution) onExecution(d.execution);
    const eRes = await fetch(`/api/missions/${missionId}/evidence`, { cache: "no-store" });
    if (eRes.ok) {
      const ed = await eRes.json();
      onEvidence(ed.evidence ?? []);
    }
    if (!(d.model?.toolProposal ?? d.toolProposal)) break;
  }
  const mRes = await fetch(`/api/missions/${missionId}`, { cache: "no-store" });
  if (mRes.ok) {
    const d = await mRes.json();
    onStatus(String(d.mission?.status ?? status), Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []);
  }
  onToast(
    stepsOk > 0 ? `Missão executada: ${stepsOk} passo(s)` : "Nenhum passo concluído",
    stepsOk > 0 ? "success" : "warning"
  );
}
