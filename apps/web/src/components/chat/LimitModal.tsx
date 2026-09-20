"use client";

import Link from "next/link";

export interface LimitModalProps {
  isOpen: boolean;
  limitData: {
    plan?: string;
    used?: number;
    max?: number | null;
    renews?: string;
    message?: string;
  } | null;
  onClose: () => void;
}

export function LimitModal({ isOpen, limitData, onClose }: LimitModalProps) {
  if (!isOpen) return null;

  const title = "Sua sonda atingiu o limite da órbita";
  const message =
    limitData?.message ||
    "Sua sonda atingiu o limite da Órbita Livre (30 mensagens em nuvem hoje). As transmissões renovam amanhã — ou conheça Caronte para ir além.";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 relative shadow-2xl ring-1 ring-[var(--selo)]/20">
        {/* Ring Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-950/50 border border-[var(--selo)]/40 flex items-center justify-center shadow-lg shadow-[var(--selo)]/10 ring-8 ring-[var(--selo)]/10">
          <svg
            className="w-8 h-8 text-[var(--selo)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-mono leading-relaxed">
            {message}
          </p>
        </div>

        {/* Usage Pill */}
        {limitData?.max && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--base)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)]">
            <span>Uso de hoje:</span>
            <strong className="text-[var(--selo)]">{limitData.used}/{limitData.max} msgs</strong>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2.5 pt-2">
          <Link
            href="/planos"
            className="block w-full py-3 rounded-2xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-bold transition-all shadow-md text-center cursor-pointer"
          >
            Conhecer os planos
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
          >
            Amanhã eu continuo
          </button>
        </div>
      </div>
    </div>
  );
}
