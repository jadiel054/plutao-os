export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-sm font-bold text-white">
              P
            </div>
            <span className="font-semibold tracking-tight">Plutão</span>
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            v0.1.0 · foundation
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
            Sistema em construção
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Plutão
          </h1>

          <p className="text-[var(--text-secondary)] text-base leading-relaxed">
            Seu sistema operacional autônomo de IA.
            <br />
            Missão → Entendimento → Planejamento → Execução → Verificação → Evidência.
          </p>

          <div className="pt-4 grid gap-3 text-left text-sm">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-[var(--text-muted)] text-xs font-mono mb-1">
                STATUS ATUAL
              </div>
              <div className="text-[var(--text-primary)]">
                Phase 1 — Foundation em andamento
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-[var(--text-muted)] text-xs font-mono mb-1">
                PRÓXIMOS PASSOS
              </div>
              <ul className="text-[var(--text-secondary)] space-y-1 list-disc list-inside">
                <li>Autenticação completa</li>
                <li>PostgreSQL + domain models</li>
                <li>Cockpit de missões</li>
                <li>PWA com atualizações transparentes</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-muted)]">
        Plutão · Personal Autonomous AI Operating System
      </footer>
    </div>
  );
}
