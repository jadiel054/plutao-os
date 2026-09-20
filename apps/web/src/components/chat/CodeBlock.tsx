"use client";

import { useState } from "react";

type CodeBlockProps = {
  code: string;
  language?: string;
  fileName?: string;
};

export function CodeBlock({ code, language = "code", fileName }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* fallback */
    }
  };

  const headerTitle = fileName || language || "código";

  return (
    <div className="my-3 rounded-2xl border border-[var(--border)]/70 bg-[#0d1117] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-[var(--border)]/30">
        <span className="text-[12px] font-medium text-[var(--text-muted)] tracking-tight">
          {headerTitle}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#21262d] transition-colors cursor-pointer"
        >
          {copied ? (
            <span className="text-[var(--selo)]">✓ Copiado</span>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copiar
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto max-h-[420px]">
        <pre className="m-0 whitespace-pre font-mono text-[12.5px] leading-relaxed text-[#e6edf3]">
          {code}
        </pre>
      </div>
    </div>
  );
}
