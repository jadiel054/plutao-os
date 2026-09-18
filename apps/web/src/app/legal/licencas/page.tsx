import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = {
  title: "Licenças",
  description: "Aviso de software de terceiros usado no Plutão.",
};

export default function LicencasPage() {
  return (
    <DocShell title="Licenças de software" updated="2026-09-18">
      <p>
        O cliente web do Plutão é construído com software livre e de código aberto. Este aviso
        lista as famílias principais. Licenças completas dos pacotes estão nos repositórios e
        nos metadados npm de cada dependência.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">Runtime e UI</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Next.js — MIT</li>
        <li>React / React DOM — MIT</li>
        <li>TypeScript — Apache-2.0</li>
        <li>Tailwind CSS — MIT</li>
        <li>Lucide (ícones) — ISC</li>
      </ul>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">Dados e ORM</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Drizzle ORM — Apache-2.0</li>
        <li>Drivers PostgreSQL compatíveis com Neon — conforme cada pacote</li>
      </ul>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">Tipografia</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Geist / Geist Mono (via next/font) — SIL Open Font License 1.1</li>
      </ul>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">Marca Plutão</h2>
      <p>
        Nome, marca gráfica e textos originais do produto Plutão não são licenciados como
        software livre nesta página. Uso da marca fora do serviço requer autorização do
        titular.
      </p>

      <p className="text-[11px] text-[var(--text-muted)] pt-4">
        Lista resumida para transparência. Atualizada quando o stack principal mudar de forma
        material.
      </p>
    </DocShell>
  );
}
