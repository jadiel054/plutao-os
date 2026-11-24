"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Aprovação contextual do Cockpit: gates de execução durável (missionId != null)
 * são aprovados/rejeitados DENTRO da missão — sem redirecionar o usuário ao
 * Chat. Após aprovar, o runtime job é liberado e a execução continua sozinha.
 */

export type MissionPendingGate = {
  id: string;
  provider: string;
  capability: string;
  target: string;
  summary: string;
  contentPreview?: string | null;
  createdAt?: string;
};

export function MissionApprovalPanel({
  missionId,
  onChanged,
}: {
  missionId: string;
  onChanged?: () => void;
}) {
  const [gates, setGates] = useState<MissionPendingGate[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gates?missionId=${encodeURIComponent(missionId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { gates?: MissionPendingGate[] };
      setGates(Array.isArray(data.gates) ? data.gates : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function decide(gateId: string, decision: "approve" | "reject") {
    setBusyId(gateId);
    try {
      const res = await fetch(`/api/gates/${gateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        await load();
        onChanged?.();
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  }

  const label = gates.length > 0
    ? `Aprovações necessárias (${gates.length})`
    : "Aprovações necessárias";
  const hint = gates.length > 0
    ? "Aprovar libera a execução e ela continua aqui, dispensando o Chat."
    : "Nenhuma escrita aguardando autorização nesta missão.";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-2 text-[11px] font-mono font-semibold text-[var(--text-muted)]">
        {label.toUpperCase()}
      </h2>
      <p className="mb-3 text-xs text-[var(--text-muted)]">{loading ? "Carregando…" : hint}</p>
      <div className="space-y-2">
        {gates.map((gate) => (
          <div key={gate.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{gate.provider} · {gate.capability}</p>
                <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">{gate.target}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === gate.id}
                  onClick={() => void decide(gate.id, "approve")}
                  className="rounded-lg bg-[var(--selo)] px-3 py-1.5 text-[11px] font-semibold text-[var(--base)] disabled:opacity-40"
                >
                  {busyId === gate.id ? "…" : "Aprovar"}
                </button>
                <button
                  type="button"
                  disabled={busyId === gate.id}
                  onClick={() => void decide(gate.id, "reject")}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-[11px] text-red-300 disabled:opacity-40"
                >
                  Recusar
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{gate.summary}</p>
            {gate.contentPreview ? (
              expanded === gate.id ? (
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] bg-[var(--base)] p-2 text-[10px] text-[var(--text-secondary)]">{gate.contentPreview}</pre>
              ) : null
            ) : null}
            {gate.contentPreview ? (
              <button
                type="button"
                className="mt-1 text-[10px] text-[var(--text-muted)] hover:underline"
                onClick={() => setExpanded(expanded === gate.id ? null : gate.id)}
              >
                {expanded === gate.id ? "Ocultar conteúdo" : "Ver conteúdo"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
