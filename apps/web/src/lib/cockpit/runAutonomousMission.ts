/**
 * Client entry for Autonomia V1.1.
 * Usa o endpoint server-side somente para enqueue durável. O navegador não
 * executa fallback local, porque isso reintroduziria o contrato não durável.
 */

async function runOnServer(opts: {
  missionId: string;
  taskId: string | null;
  onStatus: (s: string, allowed: string[]) => void;
  onExecution: (e: unknown) => void;
  onEvidence: (ev: unknown[]) => void;
  onError: (msg: string) => void;
  onToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
}): Promise<boolean> {
  const res = await fetch(`/api/missions/${opts.missionId}/autonomous-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentTaskId: opts.taskId }),
  });
  const d = await res.json().catch(() => ({}));

  if (res.status === 202) {
    if (d.executionId) {
      opts.onExecution({
        id: d.executionId,
        status: String(d.executionStatus ?? "PENDING"),
        jobId: d.jobId,
        jobStatus: d.status,
      });
    }
    opts.onToast(
      d.message ??
        (d.queued
          ? "Missão enfileirada para execução durável; você pode fechar esta tela."
          : "A missão já possui um job durável em processamento."),
      "info"
    );
    return true;
  }

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
      status: d.executionStatus ?? (d.completed ? "COMPLETED" : "RUNNING"),
      jobId: d.jobId,
      jobStatus: d.status,
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
  onToast: (msg: string, type: "success" | "error" | "warning" | "info") => void;
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
    opts.onError("Worker durável indisponível; a missão não foi executada.");
    opts.onToast("Worker durável indisponível; a missão não foi executada.", "error");
    return;
  } catch {
    opts.onError("Não foi possível enfileirar a missão no worker durável.");
    opts.onToast("Não foi possível enfileirar a missão no worker durável.", "error");
    return;
  }
}
