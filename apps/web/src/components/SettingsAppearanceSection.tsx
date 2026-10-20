"use client";

type FontScale = "small" | "default" | "large" | "xlarge";

type Props = {
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
};

const options: Array<{ value: FontScale; label: string; description: string; multiplier: string }> = [
  { value: "small", label: "Pequena", description: "Mais conteúdo na tela", multiplier: "90%" },
  { value: "default", label: "Padrão", description: "Equilíbrio recomendado", multiplier: "100%" },
  { value: "large", label: "Grande", description: "Mais conforto para ler", multiplier: "112%" },
  { value: "xlarge", label: "Extra grande", description: "Máxima legibilidade", multiplier: "125%" },
];

export function SettingsAppearanceSection({ fontScale, setFontScale }: Props) {
  const selected = options.find((option) => option.value === fontScale) ?? options[1];
  const previewScale = { small: 0.9, default: 1, large: 1.12, xlarge: 1.25 }[fontScale];

  return (
    <section className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 animate-in fade-in duration-200">
      <div className="border-b border-[var(--border)] pb-3">
        <h2 className="text-base font-semibold">Aparência e leitura</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Ajuste o tamanho da fonte para ler conversas com mais conforto. A escolha fica salva na sua conta.</p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--base)] p-5" aria-live="polite">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Preview do chat</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{selected.label} · {selected.multiplier}</p>
          </div>
          <span className="rounded-full border border-[var(--selo)]/30 bg-[var(--selo)]/10 px-2 py-1 text-[10px] text-[var(--selo)]">Ao vivo</span>
        </div>
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ fontSize: `${previewScale}em` }}>
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[var(--user-gradient-start)] px-4 py-3 text-[var(--base)] shadow-sm">
            Quero mais espaço para ler minhas mensagens.
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--agent-border)] bg-[var(--agent-surface)] px-4 py-3 leading-relaxed">
            O chat se adapta imediatamente. Você pode escolher o tamanho que funciona melhor no celular e no desktop.
          </div>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-[var(--text-primary)]">Tamanho da fonte</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFontScale(option.value)}
              aria-pressed={fontScale === option.value}
              className={`min-h-16 rounded-xl border px-3 py-2 text-left transition ${fontScale === option.value ? "border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--selo)]" : "border-[var(--border)] bg-[var(--base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"}`}
            >
              <span className="block text-xs font-semibold">{option.label}</span>
              <span className="mt-1 block text-[10px] opacity-75">{option.description}</span>
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
