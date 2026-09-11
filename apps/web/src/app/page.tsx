import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--selo)] flex items-center justify-center text-sm font-bold text-[var(--base)]">P</div>
            <span className="font-semibold tracking-tight">Plutão</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {user ? (
              <Link href="/cockpit" className="rounded-lg bg-[var(--selo)] text-[var(--base)] px-3 py-1.5 font-medium hover:bg-[var(--nucleo)]">Cockpit</Link>
            ) : (
              <>
                <Link href="/login" className="text-[var(--nucleo)] hover:underline">Entrar</Link>
                <Link href="/register" className="rounded-lg bg-[var(--selo)] text-[var(--base)] px-3 py-1.5 font-medium hover:bg-[var(--nucleo)]">Criar conta</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
            Phase 2 · Mission Core
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Plutão</h1>
          <p className="text-[var(--text-secondary)] text-base leading-relaxed">
            Seu sistema operacional autônomo de IA.
            <br />
            Missão → Entendimento → Planejamento → Execução → Verificação → Evidência.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <Link href="/cockpit" className="rounded-lg bg-[var(--selo)] text-[var(--base)] font-medium px-5 py-2.5 text-sm hover:bg-[var(--nucleo)]">Abrir cockpit</Link>
            ) : (
              <>
                <Link href="/register" className="rounded-lg bg-[var(--selo)] text-[var(--base)] font-medium px-5 py-2.5 text-sm hover:bg-[var(--nucleo)]">Começar</Link>
                <Link href="/login" className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--selo)]">Já tenho conta</Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
