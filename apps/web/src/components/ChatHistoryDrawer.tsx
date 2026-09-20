"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BrandMark } from "@/components/BrandMark";

export type ChatHistoryItem = {
  id: string;
  title: string;
  subtitle?: string;
  at?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
  userInitial?: string;
  history: ChatHistoryItem[];
  onNewChat: () => void;
  onSelectHistory?: (id: string) => void;
};

/**
 * Drawer lateral estilo produto premium (histórico + atalhos Plutão).
 * Sobreposição sobre o chat com transição suave — não é genérico de template.
 */
export function ChatHistoryDrawer({
  open,
  onClose,
  userEmail,
  userInitial = "P",
  history,
  onNewChat,
  onSelectHistory,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed top-0 left-0 z-[70] h-full w-[min(20rem,88vw)] flex flex-col
          bg-[var(--surface)] border-r border-[var(--border)] shadow-2xl
          transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu do chat"
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark size={22} />
            <span className="text-sm font-semibold tracking-tight truncate">
              Plut<span className="text-[var(--selo)]">ão</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--base)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Fechar menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--base)]/60 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--selo)]/50 hover:bg-[var(--base)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Nova conversa
          </button>
        </div>

        <nav className="px-2 space-y-0.5">
          {[
            { href: "/cockpit", label: "Missões", hint: "Planos e evidência" },
            { href: "/configuracoes?tab=conectores", label: "Conectores", hint: "GitHub e integrações" },
            { href: "/configuracoes", label: "Configurações", hint: "Conta e modelos" },
            { href: "/ajuda", label: "Ajuda", hint: "Central Plutão" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex flex-col px-3 py-2.5 rounded-xl text-left hover:bg-[var(--base)]/80 transition-colors"
            >
              <span className="text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{item.hint}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-3 px-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Conversas
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {history.length === 0 ? (
            <p className="px-3 py-6 text-xs text-[var(--text-muted)] text-center leading-relaxed">
              Ainda não há histórico nesta sessão.
              <br />
              Suas conversas ficam neste dispositivo.
            </p>
          ) : (
            history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onSelectHistory?.(h.id);
                  onClose();
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--base)]/80 transition-colors"
              >
                <span className="block text-sm text-[var(--text-primary)] truncate">{h.title}</span>
                {(h.subtitle || h.at) && (
                  <span className="block text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                    {[h.subtitle, h.at].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="border-t border-[var(--border)] p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--selo)]/15 border border-[var(--selo)]/30 flex items-center justify-center text-sm font-semibold text-[var(--selo)]">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[var(--text-primary)] truncate">
              {userEmail || "Conta Plutão"}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">Operador</p>
          </div>
        </div>
      </aside>
    </>
  );
}
