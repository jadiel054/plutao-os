"use client";

export type EvidenceDisplayItem = {
  id: string;
  type: string;
  content: string;
  source: string;
  createdAt?: string;
  taskId?: string | null;
};

function formatAt(at?: string): string {
  if (!at) return "";
  try {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return at;
  }
}

function tryPretty(content: string): string {
  const t = content.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      return content;
    }
  }
  return content;
}

export function MissionEvidencePanel({
  items,
  loading = false,
}: {
  items: EvidenceDisplayItem[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-4 text-xs text-[var(--text-muted)] font-mono">
        Carregando evidências…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--base)] p-4 text-xs text-[var(--text-muted)]">
        Nenhuma evidência ainda. Execute steps/tools na missão para coletar provas.
      </div>
    );
  }

  const ordered = items.slice().reverse();

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-3 space-y-2 max-h-72 overflow-y-auto">
      <div className="flex items-center justify-between gap-2 sticky top-0 bg-[var(--base)] pb-2 z-10">
        <div className="text-[10px] font-mono text-[var(--text-muted)] font-semibold">
          EVIDÊNCIAS ({items.length})
        </div>
        <span className="text-[9px] font-mono text-[var(--text-muted)]">mais recente primeiro</span>
      </div>
      {ordered.map((e) => {
        const pretty = tryPretty(e.content);
        const isJson = pretty !== e.content;
        return (
          <article
            key={e.id}
            className="text-xs border border-[var(--border)] rounded-xl bg-[var(--surface)]/50 overflow-hidden"
          >
            <header className="flex flex-wrap items-center justify-between gap-1 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface)]">
              <span className="font-mono text-[10px] text-[var(--selo)]">
                {e.source || "source"} · {e.type || "item"}
              </span>
              {e.createdAt ? (
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{formatAt(e.createdAt)}</span>
              ) : null}
            </header>
            <div className="px-3 py-2">
              {isJson ? (
                <pre className="text-[10px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words leading-relaxed m-0">
                  {pretty}
                </pre>
              ) : (
                <p className="text-[var(--text-primary)] leading-relaxed m-0 break-words">{e.content}</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
