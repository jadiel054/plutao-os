"use client";

export function SettingsAboutSection() {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-base font-semibold">Sobre o Sistema</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Arquitetura do Plutão e estado da plataforma
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] space-y-2">
          <h3 className="font-semibold text-[var(--text-primary)]">Plutão</h3>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Sistema operacional autônomo pessoal — Chat, Cockpit, Runtime Loop e Provedor Híbrido.
          </p>
          <div className="pt-2 border-t border-[var(--border)] text-[11px] font-mono text-[var(--selo)]">
            Versão: 0.1.0 (Phase 2 · Mission Core)
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] space-y-2">
          <h3 className="font-semibold text-[var(--text-primary)]">Tecnologias</h3>
          <ul className="text-[11px] text-[var(--text-muted)] space-y-1 font-mono">
            <li>• Next.js 15 (App Router)</li>
            <li>• Neon PostgreSQL + Drizzle ORM</li>
            <li>• HuggingFace Transformers (WebGPU)</li>
            <li>• Groq LLM API Integration</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
