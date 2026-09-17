"use client";

import { useState } from "react";
import { useModelMode } from "@/hooks/useModelMode";
import { useModelManager } from "@/hooks/useModelManager";
import { ModelFilterMenu } from "@/components/models/ModelFilterMenu";
import { ModelCard } from "@/components/models/ModelCard";
import { ModelTestModal } from "@/components/models/ModelTestModal";
import { AIModel } from "@plutao/domain";

type Props = {
  onNotify: (message: string, type?: "success" | "info" | "warning" | "error", title?: string) => void;
};

export function SettingsModelsSection({ onNotify }: Props) {
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [selectedTestModel, setSelectedTestModel] = useState<AIModel | null>(null);

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
                isActive={activeModelId === m.id}
                progress={progresses[m.id]}
                onActivate={() => {
                  void activateModel(m.id).then(() => onNotify(`Modelo ${m.name} ativado`, "success"));
                }}
                onDownload={() => {
                  void startDownload(m);
                  onNotify(`Download de ${m.name}`, "info");
                }}
                onCancel={() => {
                  cancelDownload(m.id);
                  onNotify("Download cancelado", "warning");
                }}
                onDelete={() => {
                  void deleteModel(m.id).then(() => onNotify("Cache removido", "warning"));
                }}
                onTest={() => setSelectedTestModel(m)}
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
