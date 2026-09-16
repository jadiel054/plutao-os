/**
 * Client entry for Autonomia V1.1.
 * Prefers server-side autonomous-run (Background Execution V1) so closing the tab
 * does not abort the in-flight server cycle (until Vercel maxDuration).
 * Falls back to legacy step-by-step client loop if the server route is unavailable.
 */

async function transitionMission(
  missionId: string,
  toStatus: string
): Promise<{ ok: boolean; status: string; allowed: string[]; error?: string }> {
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
    };
  }
  return {
    ok: true,
    status: String(d.mission?.status ?? toStatus),
    allowed: Array.isArray(d.allowedTransitions) ? d.allowedTransitions : [],
  };
}

async function runOnServer(opts: {
  missionId: string;
  taskId: string | null;
  onStatus: (s: string, allowed: string[]) => void;
  onExecution: (e: unknown) => void;
  onEvidence: (ev: unknown[]) => void;
  onError: (msg: string) => void;
  onToast: (msg: string, type: "success" | "error" | "warning") => void;
}): Promise<boolean> {
  const res = await fetch(`/api/missions/${opts.missionId}/autonomous-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentTaskId: opts.taskId }),
  });
  const d = await res.json().catch(() => ({}));

  if (res.status === 404 && d.error !== "Missão não encontrada" && d.missionId == null) {
    return false;
  }
  if (res.status === 404 && d.error === "Missão não encontrada") {
    opts.onError(d.error);
    opts.onToast(d.error, "error");
    return true;
  }

  if (d.finalStatus) {
    opts.onStatus(
      String(d.finalStatus),
      Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []
    );
  }
  if (d.executionId) {
    opts.onExecution({
      id: d.executionId,
      status: d.completed ? "COMPLETED" : "RUNNING",
    });
  }

  try {
    const eRes = await fetch(`/api/missions/${opts.missionId}/evidence`, {
      cache: "no-store",
    });
    if (eRes.ok) {
      const ed = await eRes.json();
      opts.onEvidence(ed.evidence ?? []);
    }
  } catch {
    /* ignore */
  }

  if (!res.ok || d.ok === false) {
    const msg =
      d.message ??
      (d.error === "MODEL_NOT_CONFIGURED"
        ? "Configure MODEL_API_KEY no Vercel"
        : d.error ?? "Falha na execução autônoma");
    opts.onError(msg);
    opts.onToast(msg, d.error === "ALREADY_TERMINAL" ? "warning" : "error");
    return true;
  }

  opts.onToast(
    d.message ??
      (d.completed
        ? `Missão COMPLETED — ${d.stepsOk ?? 0} passo(s), DoD OK`
        : `Execução ok (${d.stepsOk ?? 0} passo(s)) — status: ${d.finalStatus}`),
    "success"
  );
  return true;
}

async function runClientLegacy(opts: {
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
  const { missionId, modelConfigured, onStatus, onExecution, onEvidence, onError, onToast } =
    opts;
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
    const t = await transitionMission(missionId, next);
    if (!t.ok) {
      onError(t.error ?? `Falha → ${next}`);
      onToast(t.error ?? `Falha → ${next}`, "error");
      return;
    }
    status = t.status;
    onStatus(status, t.allowed);
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

  if (stepsOk === 0) {
    onToast("Nenhum passo concluído", "warning");
    return;
  }

  try {
    await fetch(`/api/executions/${exec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
  } catch {
    /* ignore */
  }

  if (status === "EXECUTING") {
    const t = await transitionMission(missionId, "VERIFYING");
    if (t.ok) {
      status = t.status;
      onStatus(status, t.allowed);
    }
  }

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
      }
    } else {
      onToast(v.summary ?? "DoD não passou", "warning");
    }
  }

  const mRes = await fetch(`/api/missions/${missionId}`, { cache: "no-store" });
  if (mRes.ok) {
    const d = await mRes.json();
    onStatus(
      String(d.mission?.status ?? status),
      Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []
    );
  }

  onToast(
    completed
      ? `Missão COMPLETED — ${stepsOk} passo(s), DoD OK`
      : `Execução ok (${stepsOk} passo(s)) — status: ${status}`,
    "success"
  );
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
  try {
    const handled = await runOnServer({
      missionId: opts.missionId,
      taskId: opts.taskId,
      onStatus: opts.onStatus,
      onExecution: opts.onExecution,
      onEvidence: opts.onEvidence,
      onError: opts.onError,
      onToast: opts.onToast,
    });
    if (handled) return;
  } catch {
    /* fallback */
  }
  await runClientLegacy(opts);
}
