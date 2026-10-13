"use client";

import { useCallback, useEffect, useState } from "react";

type QueueCounts = {
  pending: number;
  running: number;
  waitingApproval: number;
  succeeded: number;
  failed: number;
  cancelled: number;
};

type QueueHealth = {
  checkedAt: string;
  counts: QueueCounts;
  expiredRunningLeases: number;
  oldestPendingAt: string | null;
  oldestWaitingApprovalAt: string | null;
};

type Props = {
  onNotify: (message: string, type?: "success" | "info" | "warning" | "error", title?: string) => void;
};

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function CockpitWorkerQueuePanel({ onNotify }: Props) {
  const [queue, setQueue] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastProcess, setLastProcess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/runtime/queue", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) return;
        onNotify("Falha ao ler fila do worker", "error");
        return;
      }
      const d = await res.json();
      if (d.queue) setQueue(d.queue);
    } catch {
      onNotify("Erro de rede ao ler a fila", "error");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const processNow = async () => {
    setProcessing(true);
    try {
      const res = await fetch("/api/runtime/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxJobs: 3 }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(d.error ?? "Falha ao processar fila", "error");
        return;
      }
      if (d.queue) setQueue(d.queue);
      const n = Array.isArray(d.processed) ? d.processed.length : 0;
      const released = typeof d.releasedApprovals === "number" ? d.releasedApprovals : 0;
      setLastProcess(
        n === 0 && released === 0
          ? "Nenhum job pendente"
          : `${n} job(s) processado(s)${released ? `, ${released} liberado(s) de aprovação` : ""}`
      );
      onNotify(
        n === 0 && released === 0
          ? "Fila vazia — nada a processar"
          : `Processados ${n} job(s)${released ? ` · ${released} liberado(s)` : ""}`,
        n > 0 ? "success" : "info",
        "Worker"
      );
    } catch {
      onNotify("Erro de rede ao processar a fila", "error");
    } finally {
      setProcessing(false);
    }
  };

  const c = queue?.counts;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-mono font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
            <span>⚙️</span> FILA DO WORKER (suas missões)
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Jobs duráveis desta conta. Atualiza a cada 30s · cron global a cada ~2 min.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            disabled={loading || processing}
            onClick={() => void refresh()}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs font-medium cursor-pointer disabled:opacity-50 hover:border-[var(--selo)]/50"
          >
            Atualizar
          </button>
          <button
            type="button"
            disabled={loading || processing}
            onClick={() => void processNow()}
            className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {processing ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                Processando…
              </>
            ) : (
              "Processar fila agora"
            )}
          </button>
        </div>
      </div>

      {loading && !queue ? (
        <p className="text-xs font-mono text-[var(--text-muted)]">Carregando contagens…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {(
              [
                { key: "pending", label: "PENDING", color: "text-amber-400" },
                { key: "running", label: "RUNNING", color: "text-sky-400" },
                { key: "waitingApproval", label: "WAITING", color: "text-violet-400" },
                { key: "succeeded", label: "OK", color: "text-emerald-400" },
                { key: "failed", label: "FAILED", color: "text-red-400" },
                { key: "cancelled", label: "CANCEL", color: "text-[var(--text-muted)]" },
              ] as const
            ).map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5"
              >
                <span className="block text-[10px] font-mono text-[var(--text-muted)]">{item.label}</span>
                <span className={`text-lg font-bold tabular-nums ${item.color}`}>
                  {c ? c[item.key] : "—"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-[var(--text-muted)]">
            <span>
              Leases expirados:{" "}
              <strong className="text-[var(--text-primary)]">{queue?.expiredRunningLeases ?? 0}</strong>
            </span>
            <span>PENDING mais antigo: {formatAge(queue?.oldestPendingAt ?? null)}</span>
            <span>WAITING mais antigo: {formatAge(queue?.oldestWaitingApprovalAt ?? null)}</span>
            {queue?.checkedAt && (
              <span>check: {new Date(queue.checkedAt).toLocaleTimeString("pt-BR")}</span>
            )}
          </div>

          {lastProcess && (
            <p className="text-[11px] font-mono text-[var(--selo)]">{lastProcess}</p>
          )}

          {(c?.pending ?? 0) > 0 && (
            <p className="text-[11px] text-amber-400/90">
              Há {c!.pending} job(s) pendente(s). Use &quot;Processar fila agora&quot; ou aguarde o cron (~2 min).
            </p>
          )}
          {(c?.waitingApproval ?? 0) > 0 && (
            <p className="text-[11px] text-violet-400/90">
              {c!.waitingApproval} job(s) aguardando Write Gate — aprove o card no chat ou ative autonomia
              elevada/total em Configurações → Conta.
            </p>
          )}
        </>
      )}
    </section>
  );
}
