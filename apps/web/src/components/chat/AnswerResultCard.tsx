"use client";

import { useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

export function AnswerResultCard({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      // Clipboard may be unavailable in a restricted or non-secure context.
    }
  }

  return (
    <section
      aria-label="Resultado destacado"
      className="my-3 overflow-hidden rounded-2xl border border-[var(--selo)]/30 bg-[var(--surface)] shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)]/50 bg-[var(--base)]/45 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--selo)]/12 text-[var(--selo)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5" />
              <path d="M4 19h16" />
              <path d="M8 16v-5" />
              <path d="M12 16V8" />
              <path d="M16 16v-3" />
            </svg>
          </span>
          <span className="truncate text-[12px] font-semibold tracking-wide text-[var(--text-primary)]">
            Resultado
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copyResult()}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border)]/30 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--selo)]"
          aria-label={copied ? "Resultado copiado" : "Copiar resultado"}
        >
          {copied ? (
            <span className="text-[var(--selo)]">Copiado</span>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copiar
            </>
          )}
        </button>
      </div>
      <div className="px-4 py-3 [&_div]:text-[14px] [&_div]:leading-relaxed [&_p]:my-0 [&_p]:text-[var(--text-primary)]">
        <MarkdownRenderer text={content} />
      </div>
    </section>
  );
}
