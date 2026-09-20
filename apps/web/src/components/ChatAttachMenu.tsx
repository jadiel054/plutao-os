"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Menu + do input: anexos e conectores — visual premium, ícones vetoriais (sem emoji genérico).
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

  const items: {
    key: string;
    label: string;
    description: string;
    onClick: () => void;
    icon: ReactNode;
  }[] = [
    {
      key: "files",
      label: "Arquivos",
      description: "Imagens, PDF, planilhas",
      onClick: onOpenFiles,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  if (onPasteLongText) {
    items.push({
      key: "long",
      label: "Texto longo",
      description: "Colar e transformar em artefato",
      onClick: onPasteLongText,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    });
  }

  items.push({
    key: "connectors",
    label: "Conectores",
    description: "GitHub e integrações",
    onClick: onOpenConnectors,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  });

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Anexar ou conectar"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--base)]/40 text-[var(--text-secondary)] flex items-center justify-center hover:border-[var(--selo)]/40 hover:text-[var(--selo)] hover:bg-[var(--base)] disabled:opacity-40 transition-all"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 mb-2 w-[15.5rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl py-1.5 z-30 overflow-hidden backdrop-blur-md">
          {items.map((item, idx) => (
            <div key={item.key}>
              {idx === items.length - 1 && items.length > 1 ? (
                <div className="h-px bg-[var(--border)]/70 my-1 mx-2" />
              ) : null}
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--base)]/80 transition-colors"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                <span className="mt-0.5 text-[var(--selo)] shrink-0">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)] leading-snug">{item.description}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
