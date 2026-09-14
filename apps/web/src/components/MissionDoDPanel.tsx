"use client";

type DodCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

type Props = {
  loading?: boolean;
  passed?: boolean | null;
  summary?: string;
  checks?: DodCheck[];
  onVerify?: () => void;
  busy?: boolean;
};

export function MissionDoDPanel({
  loading,
  passed,
  summary,
  checks = [],
  onVerify,
  busy,
}: Props) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-mono text-[var(--text-muted)] font-semibold">
          DEFINITION OF DONE
        </div>
        {passed === true && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300">
            PASSED
          </span>
        )}
        {passed === false && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-red-500/40 text-red-300">
            FAILED
          </span>
        )}
      </div>

      {summary && (
        <p className="text-xs text-[var(--text-primary)]">{summary}</p>
      )}

      {loading ? (
        <p className="text-xs text-[var(--text-muted)] font-mono">Verificando…</p>
      ) : checks.length > 0 ? (
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li
              key={c.id}
              className="text-[11px] flex items-start gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            >
              <span className={c.passed ? "text-emerald-400" : "text-red-400"}>
                {c.passed ? "✓" : "✗"}
              </span>
              <span className="flex-1">
                <span className="text-[var(--text-primary)]">{c.label}</span>
                {c.detail && (
                  <span className="block text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                    {c.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-muted)] italic">
          Rode a verificação para ver os critérios determinísticos.
        </p>
      )}

      {onVerify && (
        <button
          type="button"
          disabled={busy || loading}
          onClick={onVerify}
          className="text-xs font-semibold rounded-xl border border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--nucleo)] px-4 py-2 disabled:opacity-40 cursor-pointer"
        >
          {loading ? "Verificando…" : "Verificar DoD"}
        </button>
      )}
    </div>
  );
}
