"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SucessoContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-[var(--base)] text-[var(--text-primary)] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-6 text-center">
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Assinatura
          </span>
          <h1 className="text-2xl font-black tracking-tight">Plano ativado</h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            O pagamento foi confirmado pela Stripe. Em alguns segundos o plano
            Caronte fica disponível na sua conta (sincronização via webhook).
          </p>
        </div>

        {sessionId && (
          <p className="text-[10px] font-mono text-[var(--text-muted)] break-all opacity-70">
            sessão: {sessionId.slice(0, 24)}…
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Link
            href="/chat"
            className="w-full py-2.5 rounded-xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-bold transition-all text-center"
          >
            Voltar ao chat
          </Link>
          <Link
            href="/planos"
            className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-semibold text-center transition-all"
          >
            Ver planos
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PlanosSucessoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--base)] flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
          Confirmando…
        </div>
      }
    >
      <SucessoContent />
    </Suspense>
  );
}
