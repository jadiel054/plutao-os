"use client";

import { useState, useEffect } from "react";

export type ReasoningStepItem = {
  id: string;
  index: number;
  text: string;
};

type ReasoningBlockProps = {
  steps: ReasoningStepItem[];
  isStreaming?: boolean;
};

export function ReasoningBlock({ steps, isStreaming = false }: ReasoningBlockProps) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Auto-collapse when streaming finishes (small delay so last step is visible)
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    } else {
      const t = setTimeout(() => setIsOpen(false), 420);
      return () => clearTimeout(t);
    }
  }, [isStreaming]);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="my-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] overflow-hidden shadow-sm relative z-0 min-w-0 max-w-full">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--border)]/10 cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isStreaming ? (
            <>
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--selo)] opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--selo)]" />
              </span>
              <span className="font-semibold text-[13px] text-[var(--text-primary)] tracking-tight">
                Pensando...
              </span>
            </>
          ) : (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--selo)]/15 text-[var(--selo)] text-xs shrink-0">
                💡
              </span>
              <span className="font-medium text-[13px] text-[var(--text-secondary)] tracking-tight">
                Raciocínio concluído
                <span className="ml-1.5 text-[11px] opacity-60 font-normal">
                  · {steps.length} {steps.length === 1 ? "passo" : "passos"}
                </span>
              </span>
            </>
          )}
        </div>

        <span className="text-[var(--text-muted)] text-xs shrink-0 opacity-70">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--border)]/30">
          <div className="space-y-2.5 pt-3">
            {steps.map((s, idx) => {
              const isDecision =
                idx === steps.length - 1 &&
                (s.text.toLowerCase().includes("decisão:") ||
                  s.text.toLowerCase().includes("vou chamar") ||
                  s.text.toLowerCase().includes("respondo direto"));

              return (
                <div
                  key={s.id || idx}
                  className={`flex gap-2.5 leading-relaxed text-[12.5px] ${
                    isDecision
                      ? "text-[var(--selo)] font-medium pt-2 mt-1 border-t border-[var(--border)]/25"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="opacity-40 select-none shrink-0 mt-px">▸</span>
                  <span className="min-w-0">{s.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
