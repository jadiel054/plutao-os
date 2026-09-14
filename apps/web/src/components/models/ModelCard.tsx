/**
 * ModelCard — Card individual de modelo estilo Hugging Face com progresso em tempo real
 */

"use client";

import { AIModel, ModelDownloadProgress } from "@plutao/domain";

interface ModelCardProps {
  model: AIModel;
  isDownloaded: boolean;
  isActive: boolean;
  progress?: ModelDownloadProgress;
  onActivate: (modelId: string) => void;
  onStartDownload: (model: AIModel) => void;
  onCancelDownload: (modelId: string) => void;
  onDeleteModel: (modelId: string) => void;
  onOpenTest: (model: AIModel) => void;
}

export function ModelCard({
  model,
  isDownloaded,
  isActive,
  progress,
  onActivate,
  onStartDownload,
  onCancelDownload,
  onDeleteModel,
  onOpenTest,
}: ModelCardProps) {
  const isDownloading = progress?.status === "downloading";

  return (
    <div
      className={`rounded-2xl border p-5 transition-all flex flex-col justify-between gap-4 ${
        isActive
          ? "border-[var(--selo)] bg-[var(--surface)] shadow-md shadow-[var(--selo)]/5 ring-1 ring-[var(--selo)]/40"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-muted)]/50"
      }`}
    >
      {/* Top Header & Badges */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Provider Tag */}
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                model.providerType === "cloud"
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              }`}
            >
              {model.providerType === "cloud" ? "☁️ Nuvem API" : "💻 Local Browser"}
            </span>

            {/* Category Tag */}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--base)] text-[var(--text-muted)]">
              {model.category === "text" && "💬 Texto"}
              {model.category === "code" && "💻 Código"}
              {model.category === "vision" && "👁️ Visão"}
              {model.category === "lightweight" && "⚡ Ultraleve"}
            </span>

            {/* Recommended Badge */}
            {model.isRecommended && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                ⭐ Recomendado
              </span>
            )}
          </div>

          {/* Status Badge */}
          <div>
            {isActive ? (
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--selo)] text-[var(--base)] shadow-xs">
                ● ATIVO
              </span>
            ) : isDownloading ? (
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500 text-black animate-pulse">
                ⏳ BAIXANDO…
              </span>
            ) : isDownloaded || model.providerType === "cloud" ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ✓ Pronto
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--base)] text-[var(--text-muted)] border border-[var(--border)]">
                Não Baixado
              </span>
            )}
          </div>
        </div>

        {/* Title & Description */}
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            {model.name}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
            {model.providerName} • {model.parameters} Parâmetros
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-2">
            {model.description}
          </p>
        </div>
      </div>

      {/* Realtime Download Progress Section */}
      {isDownloading && progress && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-amber-300 font-semibold">Progresso de Download: {progress.progress}%</span>
            <span className="text-amber-400">{progress.speedMBs} MB/s</span>
          </div>
          <div className="w-full h-2 rounded-full bg-amber-950 overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300 rounded-full"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
            <span>
              {(progress.loadedBytes / 1000000).toFixed(0)} MB / {(progress.totalBytes / 1000000).toFixed(0)} MB
            </span>
            <button
              type="button"
              onClick={() => onCancelDownload(model.id)}
              className="text-red-400 hover:underline cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Model Specs Grid */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)] text-[11px] font-mono">
        <div className="p-2 rounded-lg bg-[var(--base)] border border-[var(--border)]">
          <span className="text-[9px] text-[var(--text-muted)] block">TAMANHO</span>
          <span className="font-semibold text-[var(--text-primary)]">{model.sizeLabel}</span>
        </div>
        <div className="p-2 rounded-lg bg-[var(--base)] border border-[var(--border)]">
          <span className="text-[9px] text-[var(--text-muted)] block">HARDWARE</span>
          <span className="font-semibold text-[var(--text-primary)] uppercase">{model.hardware}</span>
        </div>
        <div className="p-2 rounded-lg bg-[var(--base)] border border-[var(--border)]">
          <span className="text-[9px] text-[var(--text-muted)] block">LICENÇA</span>
          <span className="font-semibold text-[var(--text-primary)] truncate block">{model.license}</span>
        </div>
      </div>

      {/* Actions Toolbar */}
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
        {/* Main Action: Activate or Download */}
        {isActive ? (
          <button
            type="button"
            disabled
            className="flex-1 py-2 rounded-xl bg-[var(--selo)]/20 text-[var(--selo)] text-xs font-semibold cursor-default text-center border border-[var(--selo)]/40"
          >
            ✓ Modelo Ativo
          </button>
        ) : model.providerType === "cloud" || isDownloaded ? (
          <button
            type="button"
            onClick={() => onActivate(model.id)}
            className="flex-1 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] hover:bg-[var(--nucleo)] text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            ⚡ Usar Modelo
          </button>
        ) : (
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => onStartDownload(model)}
            className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>⬇️</span>
            <span>Baixar Modelo</span>
          </button>
        )}

        {/* Test Button */}
        <button
          type="button"
          onClick={() => onOpenTest(model)}
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer flex items-center gap-1"
          title="Testar resposta do modelo em tempo real"
        >
          <span>🧪 Testar</span>
        </button>

        {/* Delete Cache (if local & downloaded) */}
        {model.providerType === "local" && isDownloaded && !isActive && (
          <button
            type="button"
            onClick={() => onDeleteModel(model.id)}
            className="px-2.5 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs transition-colors cursor-pointer"
            title="Remover cache local do modelo"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
