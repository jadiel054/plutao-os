"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { CONSENT_POLICY_VERSION, EMPTY_CONSENTS, type ConsentScope, type ConsentState } from "@/lib/consent";

const CARDS: Array<{ scope: ConsentScope; title: string; description: string; legal: string }> = [
  {
    scope: "service_notifications",
    title: "Notificações de serviço",
    description: "Receba avisos sobre missões concluídas, falhas e aprovações pendentes.",
    legal: "Base: execução de contrato. Você pode desligar quando quiser.",
  },
  {
    scope: "marketing",
    title: "Novidades e promoções",
    description: "Receba novidades do Plutão, lançamentos e comunicações promocionais.",
    legal: "Base: consentimento. O opt-in é separado e pode ser revogado a qualquer momento.",
  },
  {
    scope: "device_analysis",
    title: "Análise de aparelho para sugerir modelos",
    description: "Usaremos a classe do seu aparelho para recomendar modelos compatíveis.",
    legal: "Coletamos faixas, como “pelo menos 4 GB de RAM”; nunca coletamos identificador único nem modelo exato. Você pode ver e apagar.",
  },
];

export default function ConsentimentosPage() {
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ConsentScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/consent", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        setConsents({ ...EMPTY_CONSENTS, ...(data.consents ?? {}) });
      } catch {
        setError("Não foi possível carregar seus consentimentos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function changeConsent(scope: ConsentScope, granted: boolean) {
    setSaving(scope);
    setError(null);
    try {
      if (scope === "service_notifications" && granted && "Notification" in window && Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("A permissão do navegador não foi concedida; o consentimento permaneceu desligado.");
          return;
        }
      }
      const response = await fetch("/api/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, granted }),
      });
      if (!response.ok) throw new Error();
      setConsents((current) => ({ ...current, [scope]: granted }));
    } catch {
      setError("Não foi possível salvar esta escolha. Tente novamente.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-dvh bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-8">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <Link href="/configuracoes" className="text-xs text-[var(--selo)] hover:underline">← Configurações</Link>
          <h1 className="text-2xl font-bold tracking-tight">Central de Consentimentos</h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Escolhas separadas por finalidade. Recusar qualquer item não impede o uso normal do Plutão.</p>
          <p className="text-[11px] text-[var(--text-muted)]">Versão da política: {CONSENT_POLICY_VERSION}</p>
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-300">{error}</p>}
        {loading ? <p className="text-sm text-[var(--text-muted)]">Carregando escolhas…</p> : (
          <div className="space-y-3">
            {CARDS.map((card) => (
              <section key={card.scope} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="text-base font-semibold">{card.title}</h2>
                    <p className="text-sm text-[var(--text-secondary)]">{card.description}</p>
                    <p className="text-xs leading-5 text-[var(--text-muted)]">{card.legal}</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{consents[card.scope] ? "Ligado" : "Desligado"}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={card.title}
                      checked={consents[card.scope]}
                      disabled={saving === card.scope}
                      onChange={(event) => void changeConsent(card.scope, event.target.checked)}
                      className="h-5 w-5 accent-[var(--selo)]"
                    />
                  </label>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
