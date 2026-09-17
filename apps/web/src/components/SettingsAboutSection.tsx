"use client";

import Link from "next/link";

type Row = {
  label: string;
  href?: string;
  external?: boolean;
  detail?: string;
};

const ROWS: Row[] = [
  { label: "Central de ajuda", href: "/ajuda" },
  { label: "Termos de uso", href: "/legal/termos" },
  { label: "Política de Privacidade", href: "/legal/privacidade" },
  { label: "Licenças", href: "/legal/licencas" },
];

export function SettingsAboutSection() {
  return (
    <section className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden divide-y divide-[var(--border)]">
        {ROWS.map((row) => {
          const className =
            "flex items-center justify-between w-full px-4 py-3.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--base)]/60 transition-colors";
          if (row.href) {
            return (
              <Link key={row.label} href={row.href} className={className}>
                <span>{row.label}</span>
                <span className="text-[var(--text-muted)] text-xs">›</span>
              </Link>
            );
          }
          return (
            <div key={row.label} className={className}>
              <span>{row.label}</span>
              {row.detail ? (
                <span className="text-[11px] font-mono text-[var(--text-muted)]">{row.detail}</span>
              ) : null}
            </div>
          );
        })}
        <div className="flex items-center justify-between w-full px-4 py-3.5 text-sm text-[var(--text-primary)]">
          <span>Plutão</span>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">0.1.0</span>
        </div>
      </div>

      <p className="text-[11px] text-[var(--text-muted)] text-center px-4 leading-relaxed">
        Sistema operacional autônomo pessoal. Versão e detalhes técnicos ficam aqui —
        a interface principal permanece limpa.
      </p>
    </section>
  );
}
