"use client";

import { useState } from "react";

export type ReasoningStepItem = {
  id: string;
  index: number;
  text: string;
};

type ReasoningBlockProps = {
  steps: ReasoningStepItem[];
  defaultOpen?: boolean;
};

export function ReasoningBlock({ steps, defaultOpen = false }: ReasoningBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="my-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-left font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--selo)] animate-pulse" />
          <span>
            Raciocínio do Núcleo <span className="opacity-60">· {steps.length} {steps.length === 1 ? "passo" : "passos"}</span>
          </span>
        </div>
        <span className="text-[10px] font-mono opacity-60">
          {isOpen ? "▲ Recolher" : "▼ Expandir"}
        </span>
      </button>

      {isOpen && (
        <div className="px-3.5 pb-3 pt-1 border-t border-[var(--border)]/40 space-y-1.5 font-mono text-[11px] text-[var(--text-muted)]">
          {steps.map((s, idx) => (
            <div key={s.id || idx} className="flex items-start gap-2">
              <span className="shrink-0 text-[var(--selo)] font-semibold">
                {s.index ?? idx + 1}.
              </span>
              <span className="leading-relaxed text-[var(--text-secondary)]">{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
