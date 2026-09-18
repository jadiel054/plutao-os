import Link from "next/link";
import type { ReactNode } from "react";

type DocShellProps = {
  title: string;
  updated?: string;
  children: ReactNode;
};

export function DocShell({ title, updated, children }: DocShellProps) {
  return (
    <div className="min-h-dvh bg-[var(--base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm font-semibold text-[var(--selo)] hover:text-[var(--nucleo)] transition-colors"
          >
            Plutão
          </Link>
          <nav className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
            <Link href="/ajuda" className="hover:text-[var(--text-primary)]">
              Ajuda
            </Link>
            <Link href="/legal/termos" className="hover:text-[var(--text-primary)]">
              Termos
            </Link>
            <Link href="/legal/privacidade" className="hover:text-[var(--text-primary)]">
              Privacidade
            </Link>
            <Link href="/legal/licencas" className="hover:text-[var(--text-primary)]">
              Licenças
            </Link>
            <Link href="/configuracoes?tab=sobre" className="hover:text-[var(--text-primary)]">
              Sobre
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {updated ? (
            <p className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">
              Atualizado: {updated}
            </p>
          ) : null}
        </div>
        <article className="prose-plutao space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          {children}
        </article>
      </main>
    </div>
  );
}
