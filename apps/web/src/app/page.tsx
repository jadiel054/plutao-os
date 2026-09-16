import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { BrandLockup, BrandMark } from "@/components/BrandMark";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <BrandMark size={28} />
            <span className="font-semibold tracking-tight text-sm sm:text-base">
              Plut<span className="text-[var(--selo)]">ão</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] px-3.5 py-1.5 font-medium hover:bg-[var(--nucleo)] transition-colors"
                >
                  Chat
                </Link>
                <Link
                  href="/cockpit"
                  className="rounded-xl border border-[var(--border)] px-3.5 py-1.5 font-medium hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors hidden sm:inline"
                >
                  Cockpit
                </Link>
                <Link
                  href="/configuracoes"
                  className="rounded-xl border border-[var(--border)] px-3.5 py-1.5 font-medium hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Configurações
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

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="max-w-lg space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1 text-xs text-[var(--text-secondary)] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Phase 2 · Mission Core
          </div>

          <BrandLockup stacked showTagline markSize={64} className="mx-auto" />

          <p className="text-[var(--text-secondary)] text-sm sm:text-base leading-relaxed">
            Sistema operacional autônomo pessoal.
            <br className="hidden sm:block" />
            Missão → Entendimento → Planejamento → Execução → Verificação → Evidência.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold px-6 py-3 text-xs sm:text-sm hover:bg-[var(--nucleo)] transition-all shadow-md"
                >
                  Abrir Chat
                </Link>
                <Link
                  href="/cockpit"
                  className="rounded-xl border border-[var(--border)] font-medium px-6 py-3 text-xs sm:text-sm hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                >
                  Abrir Cockpit
                </Link>
                <Link
                  href="/configuracoes"
                  className="rounded-xl border border-[var(--border)] font-medium px-6 py-3 text-xs sm:text-sm hover:border-[var(--selo)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                >
                  Configurações
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold px-6 py-3 text-xs sm:text-sm hover:bg-[var(--nucleo)] transition-all shadow-md"
                >
                  Começar
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-[var(--border)] px-6 py-3 text-xs sm:text-sm text-[var(--text-secondary)] hover:border-[var(--selo)] hover:text-[var(--text-primary)] transition-all"
                >
                  Já tenho conta
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
