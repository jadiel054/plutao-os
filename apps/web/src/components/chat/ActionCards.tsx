"use client";

import { useState } from "react";

export type ToolCallItem = {
  id: string;
  provider: string;
  capability: string;
  status: "executing" | "ok" | "error";
  summaryInput?: string;
  summaryOutput?: string;
  fullInput?: unknown;
  fullOutput?: unknown;
  durationMs?: number;
};

type ActionCardsProps = {
  toolCalls: ToolCallItem[];
};

export function ActionCards({ toolCalls }: ActionCardsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="my-2 space-y-2">
      <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider font-semibold">
        Ações de Conectores ({toolCalls.length})
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {toolCalls.map((tc) => {
          const isExpanded = expandedId === tc.id;
          const isOk = tc.status === "ok";
          const isExecuting = tc.status === "executing";

          return (
            <div
              key={tc.id}
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--border)] text-[var(--text-secondary)] capitalize font-mono">
                    {tc.provider}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)] font-mono">
                    {tc.capability}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {tc.durationMs !== undefined && (
                    <span className="font-mono text-[var(--text-muted)]">
                      {tc.durationMs}ms
                    </span>
                  )}
                  {isExecuting && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold animate-pulse">
                      Executando…
                    </span>
                  )}
                  {isOk && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                      ✓ Concluído
                    </span>
                  )}
                  {!isOk && !isExecuting && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-semibold">
                      ✕ Erro
                    </span>
                  )}
                </div>
              </div>

              {tc.summaryOutput && (
                <p className="text-[11px] text-[var(--text-muted)] font-mono line-clamp-2">
                  {tc.summaryOutput}
                </p>
              )}

              {(tc.fullInput || tc.fullOutput || tc.summaryInput) && (
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : tc.id)}
                    className="text-[10px] text-[var(--selo)] hover:underline font-mono cursor-pointer"
                  >
                    {isExpanded ? "Ocultar detalhes" : "Ver input/output"}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-2 rounded-lg bg-[var(--base)] border border-[var(--border)]/60 font-mono text-[10px] space-y-1.5 overflow-x-auto max-h-48">
                      {tc.fullInput !== undefined && (
                        <div>
                          <div className="text-[var(--text-muted)] font-semibold">Input:</div>
                          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap">
                            {typeof tc.fullInput === "string"
                              ? tc.fullInput
                              : JSON.stringify(tc.fullInput, null, 2)}
                          </pre>
                        </div>
                      )}
                      {(tc.fullOutput !== undefined || tc.summaryOutput) && (
                        <div>
                          <div className="text-[var(--text-muted)] font-semibold">Output:</div>
                          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap">
                            {typeof tc.fullOutput === "string"
                              ? tc.fullOutput
                              : tc.fullOutput !== undefined
                              ? JSON.stringify(tc.fullOutput, null, 2)
                              : tc.summaryOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
