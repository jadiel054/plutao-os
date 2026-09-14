/** Client-side autonomous mission execution helpers */

async function transitionMission(
  missionId: string,
  toStatus: string
): Promise<{ ok: boolean; status: string; allowed: string[]; error?: string; dod?: unknown }> {
  const res = await fetch(`/api/missions/${missionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "transition", toStatus }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: toStatus,
      allowed: Array.isArray(d.allowed) ? d.allowed : [],
      error: d.message ?? d.error ?? `Falha → ${toStatus}`,
      dod: d.dod,
    };
  }
  return {
    ok: true,
    status: String(d.mission?.status ?? toStatus),
    allowed: Array.isArray(d.allowedTransitions) ? d.allowedTransitions : [],
  };
}

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

  // 1) Ciclo até EXECUTING
  const path = ["UNDERSTANDING", "PLANNING", "EXECUTING"] as const;
  const order = ["CREATED", "UNDERSTANDING", "PLANNING", "EXECUTING"];
  for (const next of path) {
    if (status === "EXECUTING") break;
    if (status === next) continue;
    const i = order.indexOf(status);
    const j = order.indexOf(next);
    if (i < 0 || j <= i) continue;
    const t = await transitionMission(missionId, next);
    if (!t.ok) {
      onError(t.error ?? `Falha → ${next}`);
      onToast(t.error ?? `Falha → ${next}`, "error");
      return;
    }
    status = t.status;
    onStatus(status, t.allowed);
  }

  // 2) Runtime
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

  // 3) Model steps (até 5 ou sem tool proposal)
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

  if (stepsOk === 0) {
    onToast("Nenhum passo concluído", "warning");
    return;
  }

  // 4) Auto-concluir runtime
  try {
    const done = await fetch(`/api/executions/${exec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    if (done.ok) {
      onExecution(null);
    }
  } catch {
    /* não bloqueia o fluxo da missão */
  }

  // 5) EXECUTING → VERIFYING
  if (status === "EXECUTING") {
    const t = await transitionMission(missionId, "VERIFYING");
    if (t.ok) {
      status = t.status;
      onStatus(status, t.allowed);
    } else {
      onToast(t.error ?? "Não foi possível ir para VERIFYING", "warning");
    }
  }

  // 6) DoD + COMPLETED se passou
  let completed = false;
  if (status === "VERIFYING") {
    const vRes = await fetch(`/api/missions/${missionId}/verify`, { cache: "no-store" });
    const v = await vRes.json().catch(() => ({}));
    if (vRes.ok && v.passed === true) {
      const t = await transitionMission(missionId, "COMPLETED");
      if (t.ok) {
        status = t.status;
        onStatus(status, t.allowed);
        completed = true;
      } else {
        onToast(
          t.error ?? "DoD OK, mas COMPLETED falhou — use → COMPLETED manualmente",
          "warning"
        );
      }
    } else {
      onToast(
        v.summary ?? "DoD não passou — revise evidências ou use → CORRECTING",
        "warning"
      );
    }
  }

  // refresh status final
  const mRes = await fetch(`/api/missions/${missionId}`, { cache: "no-store" });
  if (mRes.ok) {
    const d = await mRes.json();
    onStatus(String(d.mission?.status ?? status), Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []);
  }
  const eRes = await fetch(`/api/missions/${missionId}/evidence`, { cache: "no-store" });
  if (eRes.ok) {
    const ed = await eRes.json();
    onEvidence(ed.evidence ?? []);
  }

  onToast(
    completed
      ? `Missão COMPLETED — ${stepsOk} passo(s), DoD OK`
      : `Execução ok (${stepsOk} passo(s)) — status: ${status}`,
    completed ? "success" : "success"
  );
}
