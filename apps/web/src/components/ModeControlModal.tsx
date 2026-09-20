"use client";

import { useModelMode } from "@/hooks/useModelMode";
import { useState, useEffect } from "react";

export interface ModeControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: string, type: "success" | "info" | "warning" | "error") => void;
}

export function ModeControlModal({ isOpen, onClose, onNotify }: ModeControlModalProps) {
  const {
    mode,
    isOnline,
    webGPUSupported,
    modelId,
    localModelStatus,
    error,
    setAutoMode,
    setOnlineMode,
    setOfflineMode,
    refreshStatus,
  } = useModelMode();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectMode = (targetMode: "auto" | "online" | "offline") => {
    if (targetMode === mode) return;

    if (targetMode === "auto") {
      setAutoMode();
      onNotify?.("Modo Automático ativado (alterna conforme conexão)", "info");
    } else if (targetMode === "online") {
      setOnlineMode();
      onNotify?.("Modo Online forçado (Groq / gpt-oss-120b)", "success");
    } else if (targetMode === "offline") {
      setOfflineMode();
      onNotify?.(
        webGPUSupported
          ? "Modo Offline ativado com aceleração WebGPU"
          : "Modo Offline ativado (CPU local)",
        "warning"
      );
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshStatus();
    setRefreshing(false);
    onNotify?.("Status de conexão e WebGPU atualizados", "info");
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="text-xl"></span>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Modo de Operação e IA
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Selecione como o Plutão deve processar suas requisições
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--base)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Current Realtime Status Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
            <span>STATUS EM TEMPO REAL</span>
            <button
              type="button"
              disabled={refreshing}
              onClick={handleRefresh}
              className="text-[var(--nucleo)] hover:underline flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              <span className={refreshing ? "animate-spin" : ""}>🔄</span> Atualizar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Conexão:</span>
              <span className={`font-semibold ${isOnline ? "text-emerald-400" : "text-amber-400"}`}>
                {isOnline ? "🟢 Online" : "🔴 Offline"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">WebGPU:</span>
              <span className={`font-semibold ${webGPUSupported ? "text-emerald-400" : "text-amber-400"}`}>
                {webGPUSupported ? "✓ Suportado" : "✗ Indisponível"}
              </span>
            </div>
            <div className="col-span-2 flex items-center gap-2 pt-1 border-t border-[var(--border)]/50">
              <span className="text-[var(--text-muted)]">Modelo Ativo:</span>
              <span className="font-mono text-[11px] text-[var(--selo)] truncate">{modelId}</span>
            </div>
            {localModelStatus && (
              <div className="col-span-2 flex items-center gap-2 text-xs">
                <span className="text-[var(--text-muted)]">Status Local:</span>
                <span className="font-mono text-[11px] text-[var(--cyan)]">{localModelStatus}</span>
              </div>
            )}
            {error && (
              <div className="col-span-2 text-xs text-red-400 font-mono bg-red-950/30 p-2 rounded border border-red-800/40">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* 3 Mode Selection Options */}
        <div className="space-y-3">
          {/* Option 1: Auto */}
          <button
            type="button"
            onClick={() => handleSelectMode("auto")}
            className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
              mode === "auto"
                ? "border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--text-primary)] shadow-sm"
                : "border-[var(--border)] bg-[var(--base)]/50 hover:bg-[var(--base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="text-xl shrink-0 mt-0.5"></span>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Automático (Híbrido)</h3>
                {mode === "auto" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--selo)] text-[var(--base)] font-bold">
                    ATIVO
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Alterna automaticamente entre nuvem (Groq) quando online e modelo local quando offline.
              </p>
            </div>
          </button>

          {/* Option 2: Online */}
          <button
            type="button"
            onClick={() => handleSelectMode("online")}
            className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
              mode === "online"
                ? "border-emerald-500 bg-emerald-500/10 text-[var(--text-primary)] shadow-sm"
                : "border-[var(--border)] bg-[var(--base)]/50 hover:bg-[var(--base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="text-xl shrink-0 mt-0.5">🌐</span>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Forçar Online</h3>
                {mode === "online" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500 text-[var(--base)] font-bold">
                    ATIVO
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Utiliza provedor de alto desempenho na nuvem (Groq - gpt-oss-120b). Requer conexão com a internet.
              </p>
            </div>
          </button>

          {/* Option 3: Offline */}
          <button
            type="button"
            onClick={() => handleSelectMode("offline")}
            className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
              mode === "offline"
                ? "border-blue-500 bg-blue-500/10 text-[var(--text-primary)] shadow-sm"
                : "border-[var(--border)] bg-[var(--base)]/50 hover:bg-[var(--base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="text-xl shrink-0 mt-0.5">📴</span>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Forçar Offline (LocalProvider)</h3>
                {mode === "offline" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500 text-white font-bold">
                    ATIVO
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Executa IA localmente no navegador via @huggingface/transformers. 100% privado, sem uso da nuvem.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-medium hover:bg-[var(--nucleo)] transition-colors cursor-pointer"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
}
