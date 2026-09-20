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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback */
    }
  };

  const headerTitle = fileName || language || "código";

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[#0d1117] text-white overflow-hidden text-xs font-mono">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#161b22] border-b border-[var(--border)]/40 text-[11px]">
        <span className="text-[var(--text-muted)] font-semibold">{headerTitle}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="px-2 py-0.5 rounded border border-[var(--border)]/60 hover:bg-[#21262d] text-[10px] text-[var(--text-secondary)] transition-colors cursor-pointer"
        >
          {copied ? "✓ Copiado!" : "Copiar"}
        </button>
      </div>
      <div className="p-3 overflow-x-auto max-h-[400px] leading-relaxed text-[12px] text-[#e6edf3]">
        <pre className="m-0 whitespace-pre font-mono">{code}</pre>
      </div>
    </div>
  );
}
