"use client";

export type FollowUpChip = {
  id: string;
  label: string;
  prompt: string;
};

type FollowUpChipsProps = {
  items: FollowUpChip[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
  onDismiss?: () => void;
};

/**
 * Chips no estilo "próximo passo" (seta + texto).
 * Toque envia o prompt como mensagem do usuário.
 */
export function FollowUpChips({
  items,
  disabled,
  onSelect,
  onDismiss,
}: FollowUpChipsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[11px] font-medium text-[var(--text-muted)] tracking-wide">
          Continuar
        </span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
          >
            Ocultar
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item.prompt)}
            className="group flex items-center gap-2.5 w-full text-left rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)]/80 px-3.5 py-2.5 hover:border-[var(--selo)]/45 hover:bg-[var(--surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--border)]/40 text-[var(--text-muted)] group-hover:text-[var(--selo)] group-hover:bg-[var(--selo)]/15 transition-colors"
              aria-hidden
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
            <span className="text-[13px] leading-snug text-[var(--text-primary)] group-hover:text-[var(--text-primary)]">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
