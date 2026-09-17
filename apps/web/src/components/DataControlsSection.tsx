"use client";

import { useEffect, useState } from "react";

type ToastFn = (message: string, type?: "success" | "info" | "warning" | "error", title?: string) => void;

type Props = {
  userEmail: string;
  onExport: () => void;
  onNotify: ToastFn;
  onOpenClearLocal: () => void;
  onOpenDeleteAccount: () => void;
};

export function DataControlsSection({
  userEmail,
  onExport,
  onNotify,
  onOpenClearLocal,
  onOpenDeleteAccount,
}: Props) {
  const [privacyMemories, setPrivacyMemories] = useState(false);
  const [privacyImproveModel, setPrivacyImproveModel] = useState(false);
  const [privacyShareLinks, setPrivacyShareLinks] = useState(false);
  const [clearingArtifacts, setClearingArtifacts] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("plutao_pref_privacy");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.memories === "boolean") setPrivacyMemories(parsed.memories);
      if (typeof parsed.improveModel === "boolean") setPrivacyImproveModel(parsed.improveModel);
      if (typeof parsed.shareLinks === "boolean") setPrivacyShareLinks(parsed.shareLinks);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: {
    memories?: boolean;
    improveModel?: boolean;
    shareLinks?: boolean;
  }) => {
    const memories = next.memories ?? privacyMemories;
    const improveModel = next.improveModel ?? privacyImproveModel;
    const shareLinks = next.shareLinks ?? privacyShareLinks;
    localStorage.setItem(
      "plutao_pref_privacy",
      JSON.stringify({ memories, improveModel, shareLinks })
    );
  };

  const Toggle = ({
    on,
    onToggle,
  }: {
    on: boolean;
    onToggle: () => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer ${
        on ? "bg-[var(--selo)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-1 animate-in fade-in duration-200">
      <div className="pb-4 border-b border-[var(--border)] mb-2">
        <h2 className="text-base font-semibold tracking-tight">Controles de dados</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Gerencie o que o Plutão guarda, usa e o que você pode apagar
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          void (async () => {
            try {
              const res = await fetch("/api/artifacts");
              const d = await res.json().catch(() => ({}));
              const n = Array.isArray(d.artifacts) ? d.artifacts.length : 0;
              onNotify(
                n === 0
                  ? "Nenhum arquivo armazenado no momento"
                  : `${n} arquivo(s) no seu espaço. Use "Excluir todos os arquivos" para remover.`,
                "info"
              );
            } catch {
              onNotify("Não foi possível listar arquivos", "error");
            }
          })();
        }}
        className="w-full text-left py-4 border-b border-[var(--border)]/60 hover:bg-[var(--base)]/40 px-1 rounded-lg transition-colors cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Gerenciar armazenamento</h3>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
              Veja quantos arquivos e artefatos você enviou ao Plutão. Você pode excluí-los a qualquer
              momento.
            </p>
          </div>
          <span className="text-[var(--text-muted)] text-lg leading-none mt-0.5">›</span>
        </div>
      </button>

      <div className="py-4 border-b border-[var(--border)]/60 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Personalizar com memórias</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Permita que o Plutão lembre detalhes das suas conversas e missões anteriores para respostas
            mais contextuais. Conversas privadas não entram nessa memória.
          </p>
        </div>
        <Toggle
          on={privacyMemories}
          onToggle={() => {
            const v = !privacyMemories;
            setPrivacyMemories(v);
            persist({ memories: v });
          }}
        />
      </div>

      <div className="py-4 border-b border-[var(--border)]/60 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Melhorar o modelo</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Ao permitir, interações anônimas podem ajudar a melhorar a qualidade das respostas do
            Plutão. Desligado por padrão; sua privacidade é protegida no processo.
          </p>
        </div>
        <Toggle
          on={privacyImproveModel}
          onToggle={() => {
            const v = !privacyImproveModel;
            setPrivacyImproveModel(v);
            persist({ improveModel: v });
          }}
        />
      </div>

      <div className="py-4 border-b border-[var(--border)]/60 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Permitir compartilhamento de links</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Gerar link de conversa ou missão para compartilhar só com quem você escolher. Sem o link,
            o conteúdo permanece privado.
          </p>
        </div>
        <Toggle
          on={privacyShareLinks}
          onToggle={() => {
            const v = !privacyShareLinks;
            setPrivacyShareLinks(v);
            persist({ shareLinks: v });
          }}
        />
      </div>

      <div className="py-4 border-b border-[var(--border)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Exportar seus dados</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            Download em JSON com preferências, agente e configurações locais.
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-medium hover:border-[var(--selo)]/50 transition-colors cursor-pointer self-start"
        >
          Exportar JSON
        </button>
      </div>

      <div className="pt-4 space-y-1">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && userEmail) {
              localStorage.removeItem(`plutao_chat_${userEmail}`);
            }
            onNotify("Histórico de conversas removido neste dispositivo", "warning");
          }}
          className="w-full text-left py-3 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer"
        >
          Excluir todas as conversas
        </button>
        <button
          type="button"
          disabled={clearingArtifacts}
          onClick={() => {
            void (async () => {
              setClearingArtifacts(true);
              try {
                const res = await fetch("/api/artifacts", { method: "DELETE" });
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}));
                  throw new Error(d.error || "Falha ao excluir arquivos");
                }
                onNotify("Todos os arquivos/artefatos foram excluídos", "warning");
              } catch (e) {
                onNotify(e instanceof Error ? e.message : "Erro ao excluir arquivos", "error");
              } finally {
                setClearingArtifacts(false);
              }
            })();
          }}
          className="w-full text-left py-3 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          {clearingArtifacts ? "Excluindo arquivos…" : "Excluir todos os arquivos"}
        </button>
        <button
          type="button"
          onClick={onOpenClearLocal}
          className="w-full text-left py-3 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer"
        >
          Limpar cache e preferências locais
        </button>
        <button
          type="button"
          onClick={onOpenDeleteAccount}
          className="w-full text-left py-3 text-sm text-red-500 hover:text-red-400 font-medium transition-colors cursor-pointer"
        >
          Excluir conta
        </button>
      </div>
    </section>
  );
}
