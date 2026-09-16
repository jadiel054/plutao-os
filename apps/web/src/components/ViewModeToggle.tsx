"use client";

import { useViewMode } from "@/hooks/useViewMode";

/**
 * Button to switch mobile ↔ desktop layout (PWA “site para computador”).
 */
export function ViewModeToggle() {
  const { mode, toggle, ready } = useViewMode();

  if (!ready) {
    return (
      <span
        className="w-8 h-8 rounded-xl border border-[var(--border)] bg-[var(--base)] opacity-40"
        aria-hidden
      />
    );
  }

  const isDesktop = mode === "desktop";

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-1.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center text-sm min-w-8 min-h-8"
      title={
        isDesktop
          ? "Usar layout mobile"
          : "Usar layout desktop (site para computador)"
      }
      aria-label={
        isDesktop
          ? "Alternar para layout mobile"
          : "Alternar para layout desktop"
      }
      aria-pressed={isDesktop}
    >
      {isDesktop ? (
        <span className="leading-none" aria-hidden>
          📱
        </span>
      ) : (
        <span className="leading-none" aria-hidden>
          🖥️
        </span>
      )}
    </button>
  );
}
