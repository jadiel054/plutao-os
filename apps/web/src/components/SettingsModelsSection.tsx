"use client";

import { useState, useEffect } from "react";
import { useModelMode } from "@/hooks/useModelMode";
import { useModelManager } from "@/hooks/useModelManager";
import { ModelFilterMenu } from "@/components/models/ModelFilterMenu";
import { ModelCard } from "@/components/models/ModelCard";
import { ModelTestModal } from "@/components/models/ModelTestModal";
import { AIModel } from "@plutao/domain";

type Props = {
  onNotify: (message: string, type?: "success" | "info" | "warning" | "error", title?: string) => void;
};

type ModelFailureLog = {
  modelId: string;
  modelName: string;
  error: string;
  timestamp: string;
  count: number;
};

export function SettingsModelsSection({ onNotify }: Props) {
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [selectedTestModel, setSelectedTestModel] = useState<AIModel | null>(null);
  const [autoFallbackEnabled, setAutoFallbackEnabled] = useState<boolean>(true);
  const [failureLogs, setFailureLogs] = useState<ModelFailureLog[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedToggle = localStorage.getItem("plutao_auto_model_fallback");
      if (savedToggle !== null) {
        setAutoFallbackEnabled(savedToggle === "true");
      }
      const savedLogs = localStorage.getItem("plutao_model_failures");
      if (savedLogs) {
        setFailureLogs(JSON.parse(savedLogs));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const {
    mode,
    isOnline,
    webGPUSupported,
    setAutoMode,
    setOnlineMode,
    setOfflineMode,
    refreshStatus,
  } = useModelMode();

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

  return (
    <section className="space-y-6 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-lg font-bold">Modelos de IA</h2>
            <p className="text-xs font-mono text-[var(--text-muted)]">
              {totalAvailable} disponíveis · {totalDownloadedLocal} locais
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFilterMenuOpen((p) => !p)}
            className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold cursor-pointer"
          >
            Filtros
          </button>
        </div>

        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={filterOptions.search}
            onChange={(e) => setFilterOptions({ ...filterOptions, search: e.target.value })}
            placeholder="Buscar modelo…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs outline-none focus:border-[var(--selo)]"
          />
        </div>

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

      {/* Auto Fallback Toggle */}
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Substituição automática de modelo</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Troca automaticamente de modelo na lista de preferência caso ocorra falha (timeout, 5xx ou resposta vazia).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !autoFallbackEnabled;
              setAutoFallbackEnabled(next);
              localStorage.setItem("plutao_auto_model_fallback", String(next));
              onNotify(`Substituição automática ${next ? "ativada" : "desativada"}`, "info");
            }}
            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              autoFallbackEnabled
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-[var(--base)] text-[var(--text-muted)] border-[var(--border)]"
            }`}
          >
            {autoFallbackEnabled ? "ON (Ativo)" : "OFF (Desativado)"}
          </button>
        </div>
      </div>

      {/* Local Failure Log */}
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Log local de falhas por modelo</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Registro de instabilidades ou timeouts registrados neste dispositivo.
            </p>
          </div>
          {failureLogs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("plutao_model_failures");
                setFailureLogs([]);
                onNotify("Log de falhas limpo", "info");
              }}
              className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/30 cursor-pointer shrink-0"
            >
              Limpar histórico
            </button>
          )}
        </div>

        {failureLogs.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] font-mono py-2">Nenhuma falha registrada recentemente.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pt-1">
            {failureLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-[var(--base)] border border-[var(--border)] gap-2">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <span className="font-bold text-[var(--text-primary)] block truncate">{log.modelName || log.modelId}</span>
                  <span className="block text-[10px] text-red-400 truncate max-w-sm">{log.error}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-red-950/40 border border-red-500/30 text-red-300 font-bold text-[10px]">
                    {log.count} {log.count === 1 ? "falha" : "falhas"}
                  </span>
                  <span className="block text-[10px] text-[var(--text-muted)]">{log.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
          <span>MODO DO PROVEDOR</span>
          <button
            type="button"
            onClick={() => void refreshStatus().then(() => onNotify("Status recarregado", "info"))}
            className="text-[var(--nucleo)] hover:underline cursor-pointer"
          >
            Recarregar
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--base)]">
            <span className="text-[var(--text-muted)] block text-[10px] font-mono">MODO</span>
            <span className="font-semibold text-[var(--selo)] uppercase">{mode}</span>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--base)]">
            <span className="text-[var(--text-muted)] block text-[10px] font-mono">REDE</span>
            <span className={`font-semibold ${isOnline ? "text-emerald-400" : "text-amber-400"}`}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--base)]">
            <span className="text-[var(--text-muted)] block text-[10px] font-mono">HW</span>
            <span className={`font-semibold ${webGPUSupported ? "text-emerald-400" : "text-amber-400"}`}>
              {webGPUSupported ? "WebGPU" : "CPU"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setAutoMode();
              onNotify("Modo Automático ativado", "info");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
              mode === "auto"
                ? "bg-[var(--selo)] text-[var(--base)] border-[var(--selo)]"
                : "bg-[var(--base)] border-[var(--border)]"
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => {
              setOnlineMode();
              onNotify("Modo Online forçado", "success");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
              mode === "online"
                ? "bg-emerald-500 text-[var(--base)] border-emerald-500"
                : "bg-[var(--base)] border-[var(--border)]"
            }`}
          >
            Online
          </button>
          <button
            type="button"
            onClick={() => {
              setOfflineMode();
              onNotify("Modo Offline ativado", "warning");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
              mode === "offline"
                ? "bg-amber-500 text-[var(--base)] border-amber-500"
                : "bg-[var(--base)] border-[var(--border)]"
            }`}
          >
            Offline
          </button>
        </div>
        <p className="text-[11px] font-mono text-[var(--text-muted)]">
          Ativo: <strong className="text-[var(--selo)]">{activeModelId}</strong>
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-mono text-[var(--text-muted)]">CATÁLOGO ({filteredModels.length})</p>
        {filteredModels.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">Nenhum modelo encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredModels.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                isDownloaded={downloadedModelIds.includes(m.id)}
                isActive={activeModelId === m.id}
                progress={progresses[m.id]}
                onActivate={(id) => {
                  activateModel(id);
                  onNotify(`Modelo ${m.name} ativado`, "success");
                }}
                onStartDownload={(model) => {
                  startDownload(model);
                  onNotify(`Download de ${model.name}`, "info");
                }}
                onCancelDownload={(id) => {
                  cancelDownload(id);
                  onNotify("Download cancelado", "warning");
                }}
                onDeleteModel={(id) => {
                  deleteModel(id);
                  onNotify("Cache removido", "warning");
                }}
                onOpenTest={(model) => setSelectedTestModel(model)}
              />
            ))}
          </div>
        )}
      </div>

      <ModelTestModal
        model={selectedTestModel}
        isOpen={Boolean(selectedTestModel)}
        isTesting={isTesting}
        testResult={testResult}
        onClose={() => setSelectedTestModel(null)}
        onRunTest={(m, p) => runModelTest(m, p)}
      />
    </section>
  );
}
