"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

type SharedMissionData = {
  id: string;
  objective: string;
  status: string;
  definitionOfDone?: string | null;
  plan?: { stepTitles?: string[] } | null;
  completedSteps?: unknown[];
  createdAt: string;
  updatedAt: string;
  projectName?: string | null;
};

export default function SharedConversationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<SharedMissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || "Link de compartilhamento inválido ou expirado.");
          return;
        }
        setData(body.mission);
      } catch {
        setError("Erro de rede ao carregar conversa compartilhada.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--base)] text-[var(--text-muted)] text-xs font-mono">
        Carregando conversa compartilhada...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-[var(--base)] text-[var(--text-primary)] space-y-4 text-center">
        <BrandMark size={36} />
        <h1 className="text-lg font-bold">Link indisponível</h1>
        <p className="text-xs text-[var(--text-muted)] max-w-md">{error || "Esta conversa não está mais compartilhada."}</p>
        <Link
          href="/chat"
          className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:opacity-90 transition-opacity font-mono"
        >
          Ir para o Plutão Chat
        </Link>
      </div>
    );
  }

  const stepTitles = Array.isArray(data.plan?.stepTitles) ? data.plan!.stepTitles! : [];

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)]">
      <header className="h-14 border-b border-[var(--border)] px-4 flex items-center justify-between bg-[var(--surface)]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="text-sm font-semibold tracking-tight">
            Plut<span className="text-[var(--selo)]">ão</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--selo)]/15 text-[var(--selo)] border border-[var(--selo)]/30">
            Apenas Leitura
          </span>
        </div>
        <Link
          href="/chat"
          className="text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Entrar / Criar conta
        </Link>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full p-4 sm:p-6 space-y-6">
        <div className="space-y-2 border-b border-[var(--border)] pb-4">
          {data.projectName && (
            <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-[var(--selo)] bg-[var(--selo)]/10 px-2.5 py-1 rounded-lg border border-[var(--selo)]/20">
              Projeto: {data.projectName}
            </span>
          )}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{data.objective}</h1>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] font-mono">
            <span>Status: <strong className="text-[var(--text-primary)]">{data.status}</strong></span>
            <span>·</span>
            <span>Criada em: {new Date(data.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>

        {stepTitles.length > 0 && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
            <h2 className="text-xs font-mono font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Plano de Execução ({stepTitles.length} passos)
            </h2>
            <ol className="space-y-2 text-xs text-[var(--text-primary)]">
              {stepTitles.map((title, i) => (
                <li key={i} className="flex items-start gap-2.5 p-2 rounded-xl bg-[var(--base)]/60 border border-[var(--border)]/50">
                  <span className="w-5 h-5 rounded-full bg-[var(--selo)]/15 text-[var(--selo)] flex items-center justify-center font-mono text-[10px] shrink-0">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{title}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {data.definitionOfDone && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-2">
            <h2 className="text-xs font-mono font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Definição de Conclusão (DoD)
            </h2>
            <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {data.definitionOfDone}
            </p>
          </section>
        )}

        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 text-center space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Esta é uma visualização pública e estática gerada pelo Plutão.
          </p>
          <Link
            href="/chat"
            className="inline-block px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:opacity-90 transition-opacity font-mono"
          >
            Iniciar sua própria conversa no Plutão
          </Link>
        </div>
      </main>
    </div>
  );
}
