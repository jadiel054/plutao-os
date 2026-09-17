"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DataControlsSection } from "@/components/DataControlsSection";
import { useModelMode } from "@/hooks/useModelMode";

type TabType = "ia" | "perfil" | "notificacoes" | "seguranca" | "sobre";

export default function SettingsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("seguranca");
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { mode } = useModelMode();

  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" });
        if (!me.ok) {
          router.replace("/login");
          return;
        }
        const meData = await me.json();
        setUserEmail(meData.user?.email ?? "");
      } catch {
        addToast("Erro ao carregar dados do usuário", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleExportData = () => {
    try {
      const exportObject = {
        userEmail,
        mode,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plutao_user_data_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("Dados exportados com sucesso!", "success");
    } catch {
      addToast("Erro ao exportar dados", "error");
    }
  };

  const handleClearData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(`plutao_chat_${userEmail}`);
      localStorage.removeItem("plutao_pref_notifications");
      localStorage.removeItem("plutao_pref_appearance");
      localStorage.removeItem("plutao_pref_privacy");
    }
    setIsClearModalOpen(false);
    addToast("Cache e dados locais foram limpos", "warning");
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        Carregando configurações…
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: "ia", label: "Modelos" },
    { id: "perfil", label: "Conta" },
    { id: "notificacoes", label: "Notificações" },
    { id: "seguranca", label: "Privacidade" },
    { id: "sobre", label: "Sobre" },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-8">
      <Header userEmail={userEmail} onNotify={(msg, type) => addToast(msg, type)} />

      <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8 space-y-6">
        <div className="border-b border-[var(--border)] pb-4">
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Controles de dados, privacidade e preferências
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-b border-[var(--border)] pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === t.id
                  ? "bg-[var(--surface)] text-[var(--selo)] border border-[var(--border)] font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "seguranca" && (
          <DataControlsSection
            userEmail={userEmail}
            onExport={handleExportData}
            onNotify={addToast}
            onOpenClearLocal={() => setIsClearModalOpen(true)}
            onOpenDeleteAccount={() => setIsDeleteAccountModalOpen(true)}
          />
        )}

        {activeTab === "ia" && (
          <p className="text-sm text-[var(--text-muted)] py-8 text-center">
            Aba Modelos em restauração nesta branch. Use Privacidade para controles de dados.
          </p>
        )}
        {activeTab === "perfil" && (
          <p className="text-sm text-[var(--text-muted)] py-8 text-center">
            Conta & Agente em restauração. Controles de dados estão em Privacidade.
          </p>
        )}
        {activeTab === "notificacoes" && (
          <p className="text-sm text-[var(--text-muted)] py-8 text-center">
            Notificações em restauração. Controles de dados estão em Privacidade.
          </p>
        )}
        {activeTab === "sobre" && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-2">
            <h2 className="font-semibold">Plutão</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Sistema Abraçado com o Esforço, Dedicação e Evolução.
            </p>
            <p className="text-[11px] font-mono text-[var(--selo)]">Versão 0.1.0 · Phase 2 Mission Core</p>
          </div>
        )}
      </main>

      <MobileNav />

      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Limpar cache e preferências?"
        message="Remove histórico de chat e preferências salvos neste navegador."
        confirmLabel="Sim, limpar"
        cancelLabel="Cancelar"
        isDanger={true}
        onConfirm={handleClearData}
        onCancel={() => setIsClearModalOpen(false)}
      />

      <ConfirmModal
        isOpen={isDeleteAccountModalOpen}
        title="Excluir conta?"
        message="Limpa dados locais e encerra a sessão. Exclusão completa no servidor virá em versão futura."
        confirmLabel="Sair e limpar este dispositivo"
        cancelLabel="Cancelar"
        isDanger={true}
        onConfirm={async () => {
          setIsDeleteAccountModalOpen(false);
          handleClearData();
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {
            /* ignore */
          }
          window.location.href = "/login";
        }}
        onCancel={() => setIsDeleteAccountModalOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
