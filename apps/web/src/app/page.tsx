import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--selo)] flex items-center justify-center text-sm font-bold text-[var(--base)] shadow-sm">
              P
            </div>
            <span className="font-semibold tracking-tight text-sm sm:text-base">Plutão</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] px-3.5 py-1.5 font-medium hover:bg-[var(--nucleo)] transition-colors"
                >
                  💬 Chat
                </Link>
                <Link
                  href="/cockpit"
                  className="rounded-xl border border-[var(--border)] px-3.5 py-1.5 font-medium hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors hidden sm:inline"
                >
                  📊 Cockpit
                </Link>
                <Link
                  href="/configuracoes"
                  className="rounded-xl border border-[var(--border)] px-3.5 py-1.5 font-medium hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  ⚙️ Configurações
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-[var(--nucleo)] hover:underline px-2 py-1">
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] px-3.5 py-1.5 font-medium hover:bg-[var(--nucleo)] transition-colors"
                >
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1 text-xs text-[var(--text-secondary)] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Phase 2 · Mission Core (Hybrid Offline/Online)
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Plutão</h1>
          <p className="text-[var(--text-secondary)] text-sm sm:text-base leading-relaxed">
            Seu sistema operacional autônomo de IA pessoal.
            <br />
            Missão → Entendimento → Planejamento → Execução → Verificação → Evidência.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold px-6 py-3 text-xs sm:text-sm hover:bg-[var(--nucleo)] transition-all shadow-md"
                >
                  💬 Abrir Chat
                </Link>
                <Link
                  href="/cockpit"
                  className="rounded-xl border border-[var(--border)] font-medium px-6 py-3 text-xs sm:text-sm hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                >
                  📊 Abrir Cockpit
                </Link>
                <Link
                  href="/configuracoes"
                  className="rounded-xl border border-[var(--border)] font-medium px-6 py-3 text-xs sm:text-sm hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                >
                  ⚙️ Configurações
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold px-6 py-3 text-xs sm:text-sm hover:bg-[var(--nucleo)] transition-all shadow-md"
                >
                  Começar Agora
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-[var(--border)] px-6 py-3 text-xs sm:text-sm text-[var(--text-secondary)] hover:border-[var(--selo)] hover:text-[var(--text-primary)] transition-all"
                >
                  Já tenho uma conta
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
