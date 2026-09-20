"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PLANS } from "@plutao/domain";

export default function PlanosPage() {
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState<boolean>(false);
  const [waitlistEmail, setWaitlistEmail] = useState<string>("");
  const [isSubmittingWaitlist, setIsSubmittingWaitlist] = useState<boolean>(false);
  const [waitlistResult, setWaitlistResult] = useState<{
    success?: boolean;
    position?: number;
    priceMonthly?: number;
    tierLabel?: string;
    message?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.plan) setCurrentPlan(data.plan);
      })
      .catch(() => {});
  }, []);

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!waitlistEmail || !waitlistEmail.includes("@")) return;

    setIsSubmittingWaitlist(true);
    setWaitlistResult(null);

    try {
      const res = await fetch("/api/founder/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitlistEmail }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setWaitlistResult({
          success: true,
          position: data.position,
          priceMonthly: data.priceMonthly,
          tierLabel: data.tierLabel,
          message: data.message,
        });
      } else {
        setWaitlistResult({
          error: data.error || "Não foi possível realizar a reserva.",
        });
      }
    } catch {
      setWaitlistResult({
        error: "Erro de rede ao processar solicitação.",
      });
    } finally {
      setIsSubmittingWaitlist(false);
    }
  }

  const freePlan = PLANS.orbita_livre;
  const proPlan = PLANS.caronte;
  const businessPlan = PLANS.constelacao;
  const enterprisePlan = PLANS.sistema_plutao;

  return (
    <div className="min-h-screen bg-[var(--base)] text-[var(--text-primary)] p-4 sm:p-8 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="text-center space-y-3 pt-6">
        <span className="text-xs font-mono text-[var(--selo)] uppercase tracking-wider px-3 py-1 rounded-full border border-[var(--selo)]/30 bg-[var(--selo)]/10 font-semibold">
          ÓRBITA DE OPERAÇÃO
        </span>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
          Até onde sua sonda pode ir?
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed">
          Escolha o nível de capacidade para operar o Plutão. O modo local/offline com WebGPU no seu dispositivo é{" "}
          <strong className="text-emerald-400 font-bold">100% gratuito e ilimitado para sempre</strong>.
        </p>
      </div>

      {/* Plans Cards Grid / Stack */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. Órbita Livre (Free) */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between gap-6 hover:border-[var(--text-muted)]/40 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--base)] border border-[var(--border)] text-[var(--text-muted)] uppercase">
                {freePlan.functional}
              </span>
              {(currentPlan === "free" || currentPlan === "orbita_livre") && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--selo)]/20 text-[var(--selo)] border border-[var(--selo)]/30">
                  SEU PLANO
                </span>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold">{freePlan.label}</h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1">{freePlan.tagline}</p>
            </div>

            <div className="py-2 border-y border-[var(--border)]">
              <span className="text-3xl font-black">R$ 0</span>
              <span className="text-xs text-[var(--text-muted)] font-mono"> / mês</span>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] font-mono">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>30 msgs em nuvem / dia</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>1 conector ativo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>3 projetos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>7 dias de histórico</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="text-emerald-300 font-semibold">WebGPU Local Ilimitado</span>
              </li>
            </ul>
          </div>

          <Link
            href="/chat"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all"
          >
            {currentPlan === "free" || currentPlan === "orbita_livre" ? "Plano Atual" : "Start Grátis"}
          </Link>
        </div>

        {/* 2. Caronte (Pro) - Highlighted */}
        <div className="rounded-2xl border-2 border-[var(--selo)] bg-[var(--surface)] p-6 flex flex-col justify-between gap-6 relative shadow-lg shadow-[var(--selo)]/10 ring-1 ring-[var(--selo)]/30">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[var(--selo)] text-[var(--base)] text-[10px] font-mono font-black uppercase tracking-wider shadow-md">
            Mais Popular
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 uppercase">
                {proPlan.functional}
              </span>
              {currentPlan === "caronte" && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--selo)] text-[var(--base)] font-bold">
                  SEU PLANO
                </span>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold flex items-center gap-1.5">
                {proPlan.label}
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1">{proPlan.tagline}</p>
            </div>

            <div className="py-2 border-y border-[var(--border)] space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs line-through text-[var(--text-muted)] font-mono">R$ 39</span>
                <span className="text-3xl font-black text-emerald-400">A partir de R$ 19</span>
                <span className="text-xs text-[var(--text-muted)] font-mono"> / mês</span>
              </div>
              <div className="space-y-0.5 text-[10px] font-mono">
                <span className="inline-block font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  Leva Fundador Escalonada
                </span>
                <p className="text-[10px] text-[var(--text-muted)] pt-0.5">
                  Pos. ≤ 100: R$ 19 · Pos. 101-500: R$ 29 · Pos. 501+: R$ 39
                </p>
              </div>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] font-mono">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="font-semibold text-emerald-300">1.000 msgs em nuvem / dia</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>100 msgs premium (GPT-4o / Claude)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>10 conectores ativos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Projetos & Histórico ilimitados</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Preço travado por 12 meses</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => setIsWaitlistModalOpen(true)}
            className="w-full py-2.5 rounded-xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            Reservar assento de fundador
          </button>
        </div>

        {/* 3. Constelação (Business) */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between gap-6 hover:border-[var(--text-muted)]/40 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--base)] border border-[var(--border)] text-[var(--text-muted)] uppercase">
                {businessPlan.functional}
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold">{businessPlan.label}</h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1">{businessPlan.tagline}</p>
            </div>

            <div className="py-2 border-y border-[var(--border)]">
              <span className="text-3xl font-black">R$ 149</span>
              <span className="text-xs text-[var(--text-muted)] font-mono"> / mês (5 assentos)</span>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] font-mono">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>5.000 msgs em nuvem / dia</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>500 msgs premium / dia</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>999 conectores</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>5 assentos inclusos</span>
              </li>
            </ul>
          </div>

          <a
            href="mailto:contato@plutao.app?subject=Interesse%20no%20Plano%20Constela%C3%A7%C3%A3o"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all cursor-pointer"
          >
            Falar com o Plutão
          </a>
        </div>

        {/* 4. Sistema Plutão (Enterprise) */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between gap-6 hover:border-[var(--text-muted)]/40 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--base)] border border-[var(--border)] text-[var(--text-muted)] uppercase">
                {enterprisePlan.functional}
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold">{enterprisePlan.label}</h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1">{enterprisePlan.tagline}</p>
            </div>

            <div className="py-2 border-y border-[var(--border)]">
              <span className="text-2xl font-black">Sob consulta</span>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] font-mono">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Mensagens e cota customizada</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>SSO / SAML Integrado</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>SLA dedicado & White Label</span>
              </li>
            </ul>
          </div>

          <a
            href="mailto:enterprise@plutao.app?subject=Contato%20Enterprise%20Plut%C3%A3o"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all cursor-pointer"
          >
            Falar com o Plutão
          </a>
        </div>
      </div>

      {/* Founder Waitlist Modal */}
      {isWaitlistModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full space-y-4 relative shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setIsWaitlistModalOpen(false);
                setWaitlistResult(null);
              }}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">
                RESERVA DE FUNDADOR
              </span>
              <h3 className="text-lg font-bold">Reserva de Preço Fundador</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Preço travado por 12 meses baseado na sua posição na fila:
              </p>
              <div className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--base)] p-2 rounded-xl border border-[var(--border)] space-y-1 mt-1">
                <p>• Posição ≤ 100: <strong className="text-emerald-400">R$ 19/mês</strong> (51% OFF)</p>
                <p>• Posição 101–500: <strong className="text-emerald-400">R$ 29/mês</strong> (25% OFF)</p>
                <p>• Posição 501+: <strong className="text-amber-300">R$ 39/mês</strong> (Preço Padrão)</p>
              </div>
            </div>

            {waitlistResult?.success ? (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2 text-center">
                <div className="space-y-1">
                  <span className="text-2xl font-black text-emerald-400 block">
                    Assento #{waitlistResult.position}
                  </span>
                  {waitlistResult.priceMonthly && (
                    <span className="inline-block text-xs font-mono font-bold text-emerald-300 bg-emerald-900/40 px-2.5 py-1 rounded-full border border-emerald-500/30">
                      Preço Travado: R$ {waitlistResult.priceMonthly}/mês
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-200 leading-relaxed pt-1">{waitlistResult.message}</p>
                <button
                  type="button"
                  onClick={() => setIsWaitlistModalOpen(false)}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-bold cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                {waitlistResult?.error && (
                  <p className="text-xs text-red-400 font-mono bg-red-950/30 p-2 rounded-lg border border-red-500/30">
                    {waitlistResult.error}
                  </p>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-mono text-[var(--text-muted)]">
                    Seu e-mail profissional ou pessoal
                  </label>
                  <input
                    type="email"
                    required
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="voce@dominio.com"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs outline-none focus:border-[var(--selo)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingWaitlist}
                  className="w-full py-2.5 rounded-xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingWaitlist ? "Reservando..." : "Confirmar Reserva — R$ 19/mês"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
