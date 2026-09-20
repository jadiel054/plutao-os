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

function formatPayload(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  if (!text) return null;

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="shrink-0 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--border)]/30 transition-colors cursor-pointer"
      title="Copiar"
      aria-label="Copiar"
    >
      {copied ? (
        <span className="text-[11px] text-[var(--selo)] font-medium">✓</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function Section({
  title,
  content,
  defaultOpen = false,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!content) return null;

  return (
    <div className="rounded-xl border border-[var(--border)]/50 bg-[var(--base)]/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <span className="opacity-60 text-[10px]">{open ? "▼" : "▶"}</span>
          {title}
        </button>
        <CopyButton text={content} />
      </div>

      {open && (
        <div className="px-3 pb-3 pt-0">
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-[var(--text-secondary)] max-h-56 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function humanTitle(provider: string, capability: string): string {
  const map: Record<string, string> = {
    repos_list: "Listar repositórios",
    issues_list: "Listar issues",
    issues_get: "Obter issue",
    pulls_list: "Listar pull requests",
    actions_list: "Listar actions",
    repo_get: "Obter repositório",
  };

  const label = map[capability] ?? capability.replace(/_/g, " ");
  return `${label} · ${provider}`;
}

export function ActionCards({ toolCalls }: ActionCardsProps) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="my-3 space-y-3">
      {toolCalls.map((tc) => {
        const isOk = tc.status === "ok";
        const isExecuting = tc.status === "executing";
        const isError = tc.status === "error";

        const requestText =
          formatPayload(tc.fullInput) ||
          (tc.summaryInput ? String(tc.summaryInput) : "");

        const responseText =
          formatPayload(tc.fullOutput) ||
          (tc.summaryOutput ? String(tc.summaryOutput) : "");

        return (
          <div
            key={tc.id}
            className="rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] overflow-hidden shadow-sm"
          >
            {/* Header do card */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--border)]/40 text-[11px] shrink-0">
                  {isExecuting ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  ) : isOk ? (
                    <span className="text-emerald-400 text-sm">✓</span>
                  ) : (
                    <span className="text-rose-400 text-sm">✕</span>
                  )}
                </span>

                <div className="min-w-0">
                  <div className="font-medium text-[13px] text-[var(--text-primary)] truncate tracking-tight">
                    {humanTitle(tc.provider, tc.capability)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-muted)]">
                    <span className="font-mono capitalize">{tc.provider}</span>
                    <span className="opacity-40">·</span>
                    <span className="font-mono">{tc.capability}</span>
                    {tc.durationMs !== undefined && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="font-mono">{tc.durationMs}ms</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                {isExecuting && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">
                    Executando
                  </span>
                )}
                {isOk && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                    Concluído
                  </span>
                )}
                {isError && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400">
                    Erro
                  </span>
                )}
              </div>
            </div>

            {/* Corpo: Request + Response */}
            <div className="p-3 space-y-2.5">
              {isExecuting && !responseText && (
                <div className="px-1 py-2 text-[12px] text-[var(--text-muted)] italic">
                  Aguardando resposta…
                </div>
              )}

              <Section
                title="Request"
                content={requestText}
                defaultOpen={false}
              />

              <Section
                title="Response"
                content={responseText}
                defaultOpen={isOk || isError}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
