"use client";

type SendMessageButtonProps = {
  isProcessing: boolean;
  disabled?: boolean;
  onStop?: () => void;
};

export function getSendMessageButtonMode(isProcessing: boolean) {
  return isProcessing
    ? { type: "button" as const, icon: "square" as const, ariaLabel: "Parar execução do agente" }
    : { type: "submit" as const, icon: "arrow-up" as const, ariaLabel: "Enviar mensagem" };
}

export function SendMessageButton({
  isProcessing,
  disabled = false,
  onStop,
}: SendMessageButtonProps) {
  const isDisabled = disabled && !isProcessing;
  const mode = getSendMessageButtonMode(isProcessing);

  return (
    <button
      type={mode.type}
      disabled={isDisabled}
      onClick={isProcessing ? onStop : undefined}
      aria-label={mode.ariaLabel}
      title={isProcessing ? "Parar execução" : "Enviar mensagem"}
      className={`group relative flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold font-mono transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--selo)] ${
        isProcessing
          ? "bg-[var(--text-primary)] text-[var(--base)] hover:bg-[var(--danger)] hover:text-white"
          : "bg-[var(--selo)] text-[var(--base)] hover:bg-[var(--nucleo)]"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="sr-only">{isProcessing ? "Parar" : "Enviar"}</span>
      {isProcessing ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </svg>
      )}
    </button>
  );
}
