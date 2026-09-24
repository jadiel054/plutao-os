"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PLANS } from "@plutao/domain";

type CheckoutSlug = "founder_19" | "founder_29" | "founder_39";

const FOUNDER_TIERS: {
  slug: CheckoutSlug;
  price: number;
  range: string;
  note: string;
}[] = [
  { slug: "founder_19", price: 19, range: "Pos. ≤ 100", note: "51% OFF" },
  { slug: "founder_29", price: 29, range: "Pos. 101–500", note: "25% OFF" },
  { slug: "founder_39", price: 39, range: "Pos. 501+", note: "Padrão" },
];

export default function PlanosPage() {
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [checkoutLoading, setCheckoutLoading] = useState<CheckoutSlug | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [canceledNotice, setCanceledNotice] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.plan) setCurrentPlan(data.plan);
      })
      .catch(() => {});

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("canceled") === "1") {
        setCanceledNotice(true);
        window.history.replaceState({}, "", "/planos");
      }
    }
  }, []);

  const startCheckout = useCallback(
    async (planSlug: CheckoutSlug) => {
      setCheckoutError(null);
      setCheckoutLoading(planSlug);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planSlug }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          router.push("/login?next=/planos");
          return;
        }

        if (!res.ok || !data.url) {
          setCheckoutError(
            typeof data.error === "string"
              ? data.error
              : "Não foi possível iniciar o checkout."
          );
          return;
        }

        window.location.href = data.url;
      } catch {
        setCheckoutError("Erro de rede ao iniciar checkout.");
      } finally {
        setCheckoutLoading(null);
      }
    },
    [router]
  );

  const freePlan = PLANS.orbita_livre;
  const proPlan = PLANS.caronte;
  const businessPlan = PLANS.constelacao;
  const enterprisePlan = PLANS.sistema_plutao;
  const isCaronte =
    currentPlan === "caronte" || currentPlan === "pro";
  const isFree =
    currentPlan === "free" || currentPlan === "orbita_livre";

  return (
    <div className="min-h-screen bg-[var(--base)] text-[var(--text-primary)] p-4 sm:p-8 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-300">
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

      {canceledNotice && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200 font-mono text-center">
          Checkout cancelado. Nenhum valor foi cobrado.
        </div>
      )}

      {checkoutError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300 font-mono text-center">
          {checkoutError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. Órbita Livre */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between gap-6 hover:border-[var(--text-muted)]/40 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--base)] border border-[var(--border)] text-[var(--text-muted)] uppercase">
                {freePlan.functional}
              </span>
              {isFree && (
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
                <span className="text-emerald-300 font-semibold">WebGPU Local Ilimitado</span>
              </li>
            </ul>
          </div>
          <Link
            href="/chat"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all"
          >
            {isFree ? "Plano atual" : "Começar grátis"}
          </Link>
        </div>

        {/* 2. Caronte — checkout fundador */}
        <div className="rounded-2xl border-2 border-[var(--selo)] bg-[var(--surface)] p-6 flex flex-col justify-between gap-6 relative shadow-lg shadow-[var(--selo)]/10 ring-1 ring-[var(--selo)]/30">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[var(--selo)] text-[var(--base)] text-[10px] font-mono font-black uppercase tracking-wider shadow-md">
            Mais popular
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 uppercase">
                {proPlan.functional}
              </span>
              {isCaronte && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--selo)] text-[var(--base)]">
                  SEU PLANO
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">{proPlan.label}</h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1">{proPlan.tagline}</p>
            </div>
            <div className="py-2 border-y border-[var(--border)] space-y-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs line-through text-[var(--text-muted)] font-mono">R$ 39</span>
                <span className="text-2xl font-black text-emerald-400">A partir de R$ 19</span>
                <span className="text-xs text-[var(--text-muted)] font-mono">/mês</span>
              </div>
              <span className="inline-block font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-mono">
                Leva fundador — preço travado 12 meses
              </span>
            </div>
            <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] font-mono">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="font-semibold text-emerald-300">1.000 msgs em nuvem / dia</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>100 msgs premium / dia</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>10 conectores ativos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Projetos e histórico ilimitados</span>
              </li>
            </ul>
          </div>

          {isCaronte ? (
            <div className="w-full py-2.5 rounded-xl border border-[var(--selo)]/40 text-center text-xs font-semibold text-[var(--selo)]">
              Plano ativo
            </div>
          ) : (
            <div className="space-y-2">
              {FOUNDER_TIERS.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  disabled={checkoutLoading !== null}
                  onClick={() => void startCheckout(t.slug)}
                  className="w-full py-2.5 rounded-xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {checkoutLoading === t.slug ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                      Redirecionando…
                    </>
                  ) : (
                    <>
                      Assinar R$ {t.price}/mês
                      <span className="opacity-70 font-mono font-normal">· {t.range}</span>
                    </>
                  )}
                </button>
              ))}
              <p className="text-[10px] text-[var(--text-muted)] font-mono text-center pt-1">
                Pagamento processado pela Stripe. Cartão não passa pelo domínio Plutão.
              </p>
            </div>
          )}
        </div>

        {/* 3. Constelação */}
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
                <span>5 assentos inclusos</span>
              </li>
            </ul>
          </div>
          <a
            href="mailto:contato@plutao.app?subject=Interesse%20no%20Plano%20Constela%C3%A7%C3%A3o"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all"
          >
            Falar com o Plutão
          </a>
        </div>

        {/* 4. Sistema Plutão */}
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
                <span>Cota e modelos customizados</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>SSO / SAML</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>SLA e white label</span>
              </li>
            </ul>
          </div>
          <a
            href="mailto:enterprise@plutao.app?subject=Contato%20Enterprise%20Plut%C3%A3o"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all"
          >
            Falar com o Plutão
          </a>
        </div>
      </div>
    </div>
  );
}
