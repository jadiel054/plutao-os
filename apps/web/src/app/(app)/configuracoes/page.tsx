"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DataControlsSection } from "@/components/DataControlsSection";
import { SettingsModelsSection } from "@/components/SettingsModelsSection";
import { SettingsAboutSection } from "@/components/SettingsAboutSection";
import { SettingsProfileSection } from "@/components/SettingsProfileSection";
import { SettingsNotificationsSection } from "@/components/SettingsNotificationsSection";
import { useModelMode } from "@/hooks/useModelMode";

type TabType = "ia" | "perfil" | "notificacoes" | "seguranca" | "sobre";

export default function SettingsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("ia");
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("Assistente Pessoal Autônomo");
  const [agentPersonality, setAgentPersonality] = useState("Prestativo, eficiente e focado em evidências");
  const [notifyMissions, setNotifyMissions] = useState(true);
  const [notifyTasks, setNotifyTasks] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);
  const [notifySounds, setNotifySounds] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "system">("dark");
  const [densityMode, setDensityMode] = useState<"comfortable" | "compact">("comfortable");
  const [language, setLanguage] = useState<"pt-BR" | "en-US">("pt-BR");
  const { mode } = useModelMode();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const loadData = useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) {
        router.replace("/login");
        return;
      }
      const meData = await me.json();
      setUserEmail(meData.user?.email ?? "");
      const a = await fetch("/api/agent", { cache: "no-store" });
      if (a.ok) {
        const d = await a.json();
        if (d.agent) {
          if (d.agent.name) setAgentName(d.agent.name);
          if (d.agent.identity) setAgentIdentity(d.agent.identity);
          if (d.agent.personality) setAgentPersonality(d.agent.personality);
        }
      }
      if (typeof window !== "undefined") {
        try {
          const sn = localStorage.getItem("plutao_pref_notifications");
          if (sn) {
            const p = JSON.parse(sn);
            if (typeof p.missions === "boolean") setNotifyMissions(p.missions);
            if (typeof p.tasks === "boolean") setNotifyTasks(p.tasks);
            if (typeof p.alerts === "boolean") setNotifyAlerts(p.alerts);
            if (typeof p.sounds === "boolean") setNotifySounds(p.sounds);
          }
          const sa = localStorage.getItem("plutao_pref_appearance");
          if (sa) {
            const p = JSON.parse(sa);
            if (p.theme) setThemeMode(p.theme);
            if (p.density) setDensityMode(p.density);
            if (p.language) setLanguage(p.language);
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      addToast("Erro ao carregar dados do usuário", "error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agentName, identity: agentIdentity, personality: agentPersonality }),
      });
      if (!res.ok) {
        addToast("Erro ao salvar configurações do agente", "error");
        return;
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "plutao_pref_notifications",
          JSON.stringify({ missions: notifyMissions, tasks: notifyTasks, alerts: notifyAlerts, sounds: notifySounds })
        );
        localStorage.setItem(
          "plutao_pref_appearance",
          JSON.stringify({ theme: themeMode, density: densityMode, language })
        );
      }
      addToast("Configurações salvas com sucesso!", "success", "Salvo");
    } catch {
      addToast("Erro ao salvar algumas configurações", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = () => {
    try {
      const exportObject = {
        userEmail,
        agent: { name: agentName, identity: agentIdentity, personality: agentPersonality },
        notifications: { notifyMissions, notifyTasks, notifyAlerts, notifySounds },
        appearance: { themeMode, densityMode, language },
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel de Configurações</h1>
            <p className="text-xs text-[var(--text-muted)]">IA, perfil, preferências e dados da conta</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAll()}
            className="self-start sm:self-auto px-5 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
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
        <div className="space-y-6">
          {activeTab === "ia" && <SettingsModelsSection onNotify={addToast} />}
          {activeTab === "perfil" && (
            <SettingsProfileSection
              userEmail={userEmail}
              agentName={agentName}
              agentIdentity={agentIdentity}
              agentPersonality={agentPersonality}
              setAgentName={setAgentName}
              setAgentIdentity={setAgentIdentity}
              setAgentPersonality={setAgentPersonality}
            />
          )}
          {activeTab === "notificacoes" && (
            <SettingsNotificationsSection
              notifyMissions={notifyMissions}
              notifyTasks={notifyTasks}
              notifyAlerts={notifyAlerts}
              notifySounds={notifySounds}
              setNotifyMissions={setNotifyMissions}
              setNotifyTasks={setNotifyTasks}
              setNotifyAlerts={setNotifyAlerts}
              setNotifySounds={setNotifySounds}
            />
          )}
          {activeTab === "seguranca" && (
            <DataControlsSection
              userEmail={userEmail}
              onExport={handleExportData}
              onNotify={addToast}
              onOpenClearLocal={() => setIsClearModalOpen(true)}
              onOpenDeleteAccount={() => setIsDeleteAccountModalOpen(true)}
            />
          )}
          {activeTab === "sobre" && <SettingsAboutSection />}
        </div>
      </main>
      <MobileNav />
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Limpar cache e preferências?"
        message="Remove histórico de chat e preferências neste navegador. Missões e arquivos no servidor não são apagados."
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
