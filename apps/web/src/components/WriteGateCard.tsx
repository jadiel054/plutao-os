"use client";

import { useState } from "react";

export type WriteGateCardProps = {
  gateId: string;
  provider: string;
  capability: string;
  target: string;
  summary: string;
  contentPreview?: string | null;
  onResolved?: (result: { status: string; output?: string; error?: string }) => void;
};

export function WriteGateCard({
  gateId,
  provider,
  capability,
  target,
  summary,
  contentPreview,
  onResolved,
}: WriteGateCardProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/gates/${gateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const msg = data.error || "Falha na decisão do gate";
        setError(msg);
        onResolved?.({ status: "failed", error: msg });
        return;
      }
      const status = String(data.status || decision);
      setDone(status);
      onResolved?.({ status, output: data.output });
    } catch {
      setError("Erro de rede");
      onResolved?.({ status: "failed", error: "Erro de rede" });
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm space-y-1">
        <div className="text-xs font-mono uppercase tracking-wide text-[var(--text-muted)]">
          Gate · {provider}
        </div>
        <p className="text-[var(--text-primary)]">
          {done === "executed"
            ? "Aprovado e executado."
            : done === "rejected"
              ? "Recusado. Nenhuma alteração foi feita."
              : `Estado: ${done}`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-[var(--surface)] p-4 text-sm space-y-3">
      <div>
        <div className="text-xs font-mono uppercase tracking-wide text-amber-500/90">
          Aprovação necessária · {provider}
        </div>
        <h3 className="mt-1 font-semibold text-[var(--text-primary)]">{summary}</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)] font-mono break-all">
          {capability} → {target}
        </p>
      </div>
      {contentPreview ? (
        <pre className="max-h-40 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--base)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
          {contentPreview}
        </pre>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act("approve")}
          className="rounded-xl bg-[var(--selo,theme(colors.emerald.600))] px-4 py-2 text-xs font-semibold text-[var(--base,#0a0a0a)] disabled:opacity-50 cursor-pointer"
        >
          {busy === "approve" ? "Executando…" : "Aprovar"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act("reject")}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
        >
          {busy === "reject" ? "…" : "Recusar"}
        </button>
      </div>
    </div>
  );
}
