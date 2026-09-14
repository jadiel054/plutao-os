"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useModelMode } from "@/hooks/useModelMode";
import { useModelManager } from "@/hooks/useModelManager";
import { ModelFilterMenu } from "@/components/models/ModelFilterMenu";
import { ModelCard } from "@/components/models/ModelCard";
import { ModelTestModal } from "@/components/models/ModelTestModal";
import { AIModel } from "@plutao/domain";

type TabType = "ia" | "perfil" | "notificacoes" | "seguranca" | "sobre";

export default function SettingsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("ia");

  // Filter Menu Drawer State
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [selectedTestModel, setSelectedTestModel] = useState<AIModel | null>(null);

  // Agent Settings
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("Assistente Pessoal Autônomo");
  const [agentPersonality, setAgentPersonality] = useState("Prestativo, eficiente e focado em evidências");

  // Notifications Settings
  const [notifyMissions, setNotifyMissions] = useState(true);
  const [notifyTasks, setNotifyTasks] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);
  const [notifySounds, setNotifySounds] = useState(false);

  // Appearance Settings
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "system">("dark");
  const [densityMode, setDensityMode] = useState<"comfortable" | "compact">("comfortable");
  const [language, setLanguage] = useState<"pt-BR" | "en-US">("pt-BR");

  // Model Mode hook
  const {
    mode,
    isOnline,
    webGPUSupported,
    setAutoMode,
    setOnlineMode,
    setOfflineMode,
    refreshStatus,
  } = useModelMode();

  // Model Manager hook (Hugging Face Interface Core)
  const {
    filteredModels,
    downloadedModelIds,
    activeModelId,
    progresses,
    filterOptions,
    isTesting,
    testResult,
    totalAvailable,
    totalDownloadedLocal,
    setFilterOptions,
    activateModel,
    startDownload,
    cancelDownload,
    deleteModel,
    runModelTest,
  } = useModelManager();

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Modals
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Load User and Preferences
  const loadData = useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) {
        router.replace("/login");
        return;
      }
      const meData = await me.json();
      const email = meData.user?.email ?? "";
      setUserEmail(email);

      // Carrega agente
      const a = await fetch("/api/agent", { cache: "no-store" });
      if (a.ok) {
        const d = await a.json();
        if (d.agent) {
          if (d.agent.name) setAgentName(d.agent.name);
          if (d.agent.identity) setAgentIdentity(d.agent.identity);
          if (d.agent.personality) setAgentPersonality(d.agent.personality);
        }
      }

      // Restore saved local settings
      if (typeof window !== "undefined") {
        const savedNotifs = localStorage.getItem("plutao_pref_notifications");
        if (savedNotifs) {
          try {
            const parsed = JSON.parse(savedNotifs);
            if (typeof parsed.missions === "boolean") setNotifyMissions(parsed.missions);
            if (typeof parsed.tasks === "boolean") setNotifyTasks(parsed.tasks);
            if (typeof parsed.alerts === "boolean") setNotifyAlerts(parsed.alerts);
            if (typeof parsed.sounds === "boolean") setNotifySounds(parsed.sounds);
          } catch {
            /* ignore */
          }
        }

        const savedAppearance = localStorage.getItem("plutao_pref_appearance");
        if (savedAppearance) {
          try {
            const parsed = JSON.parse(savedAppearance);
            if (parsed.theme) setThemeMode(parsed.theme);
            if (parsed.density) setDensityMode(parsed.density);
            if (parsed.language) setLanguage(parsed.language);
          } catch {
            /* ignore */
          }
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

  // Save Settings Handler
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Save agent info via API
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName,
          identity: agentIdentity,
          personality: agentPersonality,
        }),
      });

      if (!res.ok) {
        let errorMsg = "Erro ao salvar configurações do agente";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          /* ignore json parse failure */
        }
        addToast(errorMsg, "error");
        return;
      }

      // 2. Save preferences in localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "plutao_pref_notifications",
          JSON.stringify({
            missions: notifyMissions,
            tasks: notifyTasks,
            alerts: notifyAlerts,
            sounds: notifySounds,
          })
        );
        localStorage.setItem(
          "plutao_pref_appearance",
          JSON.stringify({
            theme: themeMode,
            density: densityMode,
            language,
          })
        );
      }

      addToast("Configurações salvas com sucesso!", "success", "Salvo");
    } catch {
      addToast("Erro ao salvar algumas configurações", "error");
    } finally {
      setSaving(false);
    }
  };

  // Export User Data JSON
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

  // Clear Local Storage Data
  const handleClearData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(`plutao_chat_${userEmail}`);
      localStorage.removeItem("plutao_pref_notifications");
      localStorage.removeItem("plutao_pref_appearance");
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

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "ia", label: "Modelos de IA", icon: "🤖" },
    { id: "perfil", label: "Conta & Agente", icon: "👤" },
    { id: "notificacoes", label: "Notificações", icon: "🔔" },
    { id: "seguranca", label: "Privacidade", icon: "🔒" },
    { id: "sobre", label: "Sobre & Ajuda", icon: "ℹ️" },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-8">
      {/* Header */}
      <Header
        userEmail={userEmail}
        onNotify={(msg, type) => addToast(msg, type)}
      />

      <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8 space-y-6">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel de Configurações</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Gerencie opções de IA, perfil do agente, preferências visuais e dados da conta
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAll()}
            className="self-start sm:self-auto px-5 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                Salvando…
              </>
            ) : (
              <>💾 Salvar Alterações</>
            )}
          </button>
        </div>

        {/* Tabbed Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 border-b border-[var(--border)] pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center justify-center sm:justify-start gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === t.id
                  ? "bg-[var(--surface)] text-[var(--selo)] border border-[var(--border)] shadow-xs font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]/50"
              }`}
            >
              <span>{t.icon}</span>
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          {/* SECTION 1: Interface Completa de Modelos de IA (Padrão Hugging Face) */}
          {activeTab === "ia" && (
            <section className="space-y-6 animate-in fade-in duration-200">
              {/* Header de Modelos */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <h2 className="text-lg font-bold">Modelos de IA</h2>
                      <p className="text-xs font-mono text-[var(--text-muted)]">
                        {totalAvailable} modelos disponíveis • {totalDownloadedLocal} baixados localmente
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {/* Botão de Filtros ⚙️ */}
                    <button
                      type="button"
                      onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                        isFilterMenuOpen
                          ? "border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--selo)]"
                          : "border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-[var(--text-primary)]"
                      }`}
                    >
                      <span>⚙️</span>
                      <span>Filtros {isFilterMenuOpen ? "▲" : "▼"}</span>
                    </button>
                  </div>
                </div>

                {/* Search Bar & Quick Counters */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute left-3 top-2.5 text-xs text-[var(--text-muted)]">🔍</span>
                    <input
                      type="text"
                      value={filterOptions.search}
                      onChange={(e) => setFilterOptions({ ...filterOptions, search: e.target.value })}
                      placeholder="Buscar por nome, repositório HF ou parâmetros…"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] pl-8 pr-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)] w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <span className="px-2.5 py-1 rounded-lg bg-[var(--base)] border border-[var(--border)]">
                      Modelo Ativo: <strong className="text-[var(--selo)]">{activeModelId}</strong>
                    </span>
                  </div>
                </div>

                {/* Filter Menu Drawer Component */}
                <ModelFilterMenu
                  isOpen={isFilterMenuOpen}
                  onClose={() => setIsFilterMenuOpen(false)}
                  options={filterOptions}
                  onChange={setFilterOptions}
                  onReset={() =>
                    setFilterOptions({
                      search: "",
                      provider: "all",
                      category: "all",
                      status: "all",
                      sortBy: "name",
                    })
                  }
                />
              </div>

              {/* Status Summary Card */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
                  <span>MODO DE OPERAÇÃO DO PROVEDOR HYBRID</span>
                  <button
                    type="button"
                    onClick={() => void refreshStatus().then(() => addToast("Status recarregado", "info"))}
                    className="text-[var(--nucleo)] hover:underline cursor-pointer"
                  >
                    🔄 Recarregar Status
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--base)] space-y-1">
                    <span className="text-[var(--text-muted)] block text-[10px] font-mono">MODO SELECIONADO</span>
                    <span className="font-semibold text-[var(--selo)] uppercase">{mode}</span>
                  </div>
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--base)] space-y-1">
                    <span className="text-[var(--text-muted)] block text-[10px] font-mono">CONEXÃO REDE</span>
                    <span className={`font-semibold ${isOnline ? "text-emerald-400" : "text-amber-400"}`}>
                      {isOnline ? "🟢 Online (API Disponível)" : "🔴 Sem Internet (Modo Local)"}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--base)] space-y-1">
                    <span className="text-[var(--text-muted)] block text-[10px] font-mono">ACELERAÇÃO HW</span>
                    <span className={`font-semibold ${webGPUSupported ? "text-emerald-400" : "text-amber-400"}`}>
                      {webGPUSupported ? "⚡ WebGPU Ativo" : "🐢 Processamento CPU"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoMode();
                      addToast("Modo Automático ativado", "info");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                      mode === "auto"
                        ? "bg-[var(--selo)] text-[var(--base)] border-[var(--selo)]"
                        : "bg-[var(--base)] text-[var(--text-secondary)] border-[var(--border)]"
                    }`}
                  >
                    ⚡ Modo Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOnlineMode();
                      addToast("Modo Online forçado", "success");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                      mode === "online"
                        ? "bg-emerald-500 text-[var(--base)] border-emerald-500"
                        : "bg-[var(--base)] text-[var(--text-secondary)] border-[var(--border)]"
                    }`}
                  >
                    🌐 Forçar Online
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOfflineMode();
                      addToast("Modo Offline ativado", "warning");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                      mode === "offline"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-[var(--base)] text-[var(--text-secondary)] border-[var(--border)]"
                    }`}
                  >
                    📴 Forçar Offline
                  </button>
                </div>
              </div>

              {/* Grid de Modelos Estilo Hugging Face */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
                  <span>CATÁLOGO DE MODELOS ({filteredModels.length})</span>
                  <span>Exibindo modelos de acordo com os filtros selecionados</span>
                </div>

                {filteredModels.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                    <span className="text-3xl">🔍</span>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Nenhum modelo encontrado</h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      Tente ajustar o termo de busca ou redefinir os filtros.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setFilterOptions({
                          search: "",
                          provider: "all",
                          category: "all",
                          status: "all",
                          sortBy: "name",
                        })
                      }
                      className="mt-2 px-4 py-2 rounded-xl bg-[var(--base)] border border-[var(--border)] text-xs text-[var(--selo)] hover:underline cursor-pointer"
                    >
                      Limpar Filtros
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredModels.map((m) => (
                      <ModelCard
                        key={m.id}
                        model={m}
                        isDownloaded={m.providerType === "cloud" || downloadedModelIds.includes(m.id)}
                        isActive={activeModelId === m.id}
                        progress={progresses[m.id]}
                        onActivate={(id) => {
                          activateModel(id);
                          addToast(`Modelo ${m.name} ativado com sucesso!`, "success");
                        }}
                        onStartDownload={(model) => {
                          startDownload(model);
                          addToast(`Iniciando download de ${model.name}`, "info");
                        }}
                        onCancelDownload={(id) => {
                          cancelDownload(id);
                          addToast("Download cancelado", "warning");
                        }}
                        onDeleteModel={(id) => {
                          deleteModel(id);
                          addToast("Cache do modelo removido", "warning");
                        }}
                        onOpenTest={(model) => {
                          setSelectedTestModel(model);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* SECTION 2: Conta e Perfil */}
          {activeTab === "perfil" && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                <span className="text-xl">👤</span>
                <div>
                  <h2 className="text-base font-semibold">2. Conta do Usuário & Personalidade do Agente</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Gerencie seus dados e ajuste a identidade do assistente autônomo Plutão
                  </p>
                </div>
              </div>

              {/* User Identity Info */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono text-[var(--text-muted)]">DADOS DA CONTA</h3>
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-[var(--text-muted)] block">E-mail Cadastrado</span>
                    <span className="text-sm font-semibold font-mono text-[var(--text-primary)]">{userEmail}</span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start sm:self-auto">
                    ✓ Autenticado
                  </span>
                </div>
              </div>

              {/* Agent Settings Form */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-mono text-[var(--text-muted)]">CONFIGURAÇÕES DO AGENTE PLUTÃO</h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Nome do Agente</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] transition-colors"
                    placeholder="Ex: Plutão"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Identidade / Papel Principal</label>
                  <input
                    type="text"
                    value={agentIdentity}
                    onChange={(e) => setAgentIdentity(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] transition-colors"
                    placeholder="Ex: Assistente Pessoal Autônomo"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Personalidade e Diretrizes</label>
                  <textarea
                    rows={3}
                    value={agentPersonality}
                    onChange={(e) => setAgentPersonality(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] transition-colors resize-none"
                    placeholder="Ex: Objetivo, rápido, analisa dados antes de agir..."
                  />
                </div>
              </div>
            </section>
          )}

          {/* SECTION 3: Notificações */}
          {activeTab === "notificacoes" && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                <span className="text-xl">🔔</span>
                <div>
                  <h2 className="text-base font-semibold">3. Notificações e Alertas</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Escolha quando e como você quer ser notificado sobre o progresso das missões
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Toggle 1 */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--base)]">
                  <div>
                    <h3 className="text-xs font-medium">Conclusão de Missões</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">Receber aviso quando uma missão atingir estado COMPLETED ou FAILED</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyMissions}
                    onChange={(e) => setNotifyMissions(e.target.checked)}
                    className="w-4 h-4 accent-[var(--selo)] cursor-pointer"
                  />
                </div>

                {/* Toggle 2 */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--base)]">
                  <div>
                    <h3 className="text-xs font-medium">Atualizações de Tarefas</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">Notificar quando uma sub-tarefa for concluída no runtime</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyTasks}
                    onChange={(e) => setNotifyTasks(e.target.checked)}
                    className="w-4 h-4 accent-[var(--selo)] cursor-pointer"
                  />
                </div>

                {/* Toggle 3 */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--base)]">
                  <div>
                    <h3 className="text-xs font-medium">Alertas do Sistema e Erros</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">Exibir mensagens visuais quando ocorrem falhas de API ou rede</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyAlerts}
                    onChange={(e) => setNotifyAlerts(e.target.checked)}
                    className="w-4 h-4 accent-[var(--selo)] cursor-pointer"
                  />
                </div>

                {/* Toggle 4 */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--base)]">
                  <div>
                    <h3 className="text-xs font-medium">Sinais Sonoros</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">Tocar um som sutil ao concluir tarefas importantes</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifySounds}
                    onChange={(e) => setNotifySounds(e.target.checked)}
                    className="w-4 h-4 accent-[var(--selo)] cursor-pointer"
                  />
                </div>
              </div>
            </section>
          )}

          {/* SECTION 5: Privacidade e Segurança */}
          {activeTab === "seguranca" && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                <span className="text-xl">🔒</span>
                <div>
                  <h2 className="text-base font-semibold">5. Privacidade, Segurança e Exportação de Dados</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Controle seus dados locais, histórico de conversas e exporte backups
                  </p>
                </div>
              </div>

              {/* Data Export Card */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold">Exportar Dados do Usuário</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Faça o download de um arquivo JSON contendo suas preferências e dados do agente
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportData}
                    className="px-4 py-2 rounded-xl border border-[var(--selo)] text-[var(--nucleo)] hover:bg-[var(--selo)]/10 text-xs font-medium transition-colors cursor-pointer"
                  >
                    📥 Exportar JSON
                  </button>
                </div>
              </div>

              {/* Clear Local Cache Card */}
              <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/10 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold text-red-400">Limpar Cache e Histórico Local</h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Remove o histórico de chat armazenado no navegador e reseta as preferências salvas
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsClearModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors self-start sm:self-auto cursor-pointer"
                  >
                    🗑️ Limpar Dados Locais
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* SECTION 6: Sobre e Ajuda */}
          {activeTab === "sobre" && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                <span className="text-xl">ℹ️</span>
                <div>
                  <h2 className="text-base font-semibold">6. Sobre o Sistema & Ajuda</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Informações sobre a arquitetura do Plutão e estado da plataforma
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] space-y-2">
                  <h3 className="font-semibold text-[var(--text-primary)]">Plutão AI Operating System</h3>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Sistema Operacional Autônomo de IA pessoal com arquitetura em camadas (Chat, Cockpit, Runtime Loop e Provedor Híbrido).
                  </p>
                  <div className="pt-2 border-t border-[var(--border)] text-[11px] font-mono text-[var(--selo)]">
                    Versão: 0.1.0 (Phase 2 · Mission Core)
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] space-y-2">
                  <h3 className="font-semibold text-[var(--text-primary)]">Tecnologias Utilizadas</h3>
                  <ul className="text-[11px] text-[var(--text-muted)] space-y-1 font-mono">
                    <li>• Next.js 15 (App Router)</li>
                    <li>• Neon PostgreSQL + Drizzle ORM</li>
                    <li>• HuggingFace Transformers (WebGPU)</li>
                    <li>• Groq LLM API Integration</li>
                  </ul>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Model Test Drawer Modal */}
      <ModelTestModal
        model={selectedTestModel}
        isOpen={Boolean(selectedTestModel)}
        isTesting={isTesting}
        testResult={testResult}
        onClose={() => setSelectedTestModel(null)}
        onRunTest={(m, p) => runModelTest(m, p)}
      />

      {/* Mobile Navigation */}
      <MobileNav />

      {/* Confirmation modal for clearing data */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Limpar Cache e Histórico Local?"
        message="Esta ação irá remover o histórico de conversas guardado localmente neste navegador. Esta ação não pode ser desfeita."
        confirmLabel="Sim, limpar dados"
        cancelLabel="Cancelar"
        isDanger={true}
        onConfirm={handleClearData}
        onCancel={() => setIsClearModalOpen(false)}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
