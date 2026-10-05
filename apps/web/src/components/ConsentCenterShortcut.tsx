import Link from "next/link";

export function ConsentCenterShortcut() {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-2">
      <h2 className="text-base font-semibold">Central de Consentimentos</h2>
      <p className="text-xs leading-5 text-[var(--text-muted)]">Gerencie separadamente notificações de serviço, novidades e análise de aparelho.</p>
      <Link href="/configuracoes/consentimentos" className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs font-medium text-[var(--selo)] hover:bg-[var(--base)]">Abrir central</Link>
    </section>
  );
}
