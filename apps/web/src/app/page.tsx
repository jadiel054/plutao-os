import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { BrandLockup, BrandMark } from "@/components/BrandMark";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)]/60 bg-[var(--surface)]/70 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <BrandMark size={30} />
            <span className="font-semibold tracking-tight text-sm sm:text-base">
              Plut<span className="text-[var(--selo)]">ão</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 text-xs">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="rounded-full bg-[var(--selo)] text-[var(--base)] px-4 py-1.5 font-medium hover:bg-[var(--nucleo)] transition-colors"
                >
                  Chat
                </Link>
                <Link
                  href="/configuracoes"
                  className="rounded-full border border-[var(--border)] px-4 py-1.5 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--selo)]/50 transition-colors"
                >
                  Configurações
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-[var(--selo)] text-[var(--base)] px-4 py-1.5 font-medium hover:bg-[var(--nucleo)] transition-colors"
                >
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-20 text-center">
        <div className="max-w-md w-full space-y-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]/80 bg-[var(--surface)]/80 px-3.5 py-1.5 text-[11px] text-[var(--text-secondary)] tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Phase 2 · Mission Core
          </div>

          <BrandLockup stacked showTagline markSize={88} className="mx-auto" />

          <div className="space-y-3 px-1">
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
              Sistema operacional autônomo pessoal.
            </p>
            <p className="text-[10px] sm:text-[11px] font-mono text-[var(--text-muted)] tracking-wide leading-relaxed">
              Missão → Entendimento → Planejamento
              <br />
              Execução → Verificação → Evidência
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="rounded-2xl bg-[var(--selo)] text-[var(--base)] font-semibold px-6 py-3.5 text-sm hover:bg-[var(--nucleo)] transition-all shadow-lg shadow-[var(--selo)]/10"
                >
                  Abrir Chat
                </Link>
                <Link
                  href="/cockpit"
                  className="rounded-2xl border border-[var(--border)] font-medium px-6 py-3.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--selo)]/40 transition-all"
                >
                  Abrir Cockpit
                </Link>
                <Link
                  href="/configuracoes"
                  className="rounded-2xl border border-transparent font-medium px-6 py-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-all"
                >
                  Configurações
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-2xl bg-[var(--selo)] text-[var(--base)] font-semibold px-6 py-3.5 text-sm hover:bg-[var(--nucleo)] transition-all shadow-lg shadow-[var(--selo)]/10"
                >
                  Começar
                </Link>
                <Link
                  href="/login"
                  className="rounded-2xl border border-[var(--border)] px-6 py-3.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--selo)]/40 transition-all"
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
