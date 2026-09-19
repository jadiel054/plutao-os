"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Menu + junto ao input do chat: Arquivos e Conectores (acesso rápido).
 */
export function ChatAttachMenu({
  onOpenFiles,
  onPasteLongText,
  onOpenConnectors,
  disabled,
}: {
  onOpenFiles: () => void;
  onPasteLongText?: () => void;
  onOpenConnectors: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Anexar ou conectar"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-xl border border-[var(--border)] bg-[var(--base)]/50 text-[var(--text-secondary)] flex items-center justify-center text-lg leading-none hover:border-[var(--selo)]/40 hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors"
      >
        +
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 mb-2 min-w-[12.5rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl py-1.5 z-30 overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--base)]/80"
            onClick={() => {
              setOpen(false);
              onOpenFiles();
            }}
          >
            <span className="text-[var(--text-muted)] w-5 text-center text-xs" aria-hidden>
              📁
            </span>
            Arquivos
          </button>
          {onPasteLongText ? (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--base)]/80"
              onClick={() => {
                setOpen(false);
                onPasteLongText();
              }}
            >
              <span className="text-[var(--text-muted)] w-5 text-center text-xs" aria-hidden>
                📝
              </span>
              Colar texto longo
            </button>
          ) : null}
          <div className="h-px bg-[var(--border)]/80 my-1" />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--base)]/80"
            onClick={() => {
              setOpen(false);
              onOpenConnectors();
            }}
          >
            <span className="text-[var(--text-muted)] w-5 text-center text-xs" aria-hidden>
              ⇄
            </span>
            Conectores
          </button>
        </div>
      ) : null}
    </div>
  );
}
