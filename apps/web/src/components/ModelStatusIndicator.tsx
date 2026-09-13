/**
 * ModelStatusIndicator - Componente para mostrar status do modelo
 * 
 * Exibe:
 * - Modo atual (ONLINE, OFFLINE, AUTO)
 * - Status de conexão
 * - Status de carregamento do modelo local
 * - Permite trocar de modo
 */

"use client";

import { useState, useEffect } from "react";
import { useModelMode, getStatusColor, getStatusLabel } from "@/hooks/useModelMode";
import { LocalModelStatus } from "@plutao/domain";

// ============================================================
// Types
// ============================================================

/** Props do componente */
export interface ModelStatusIndicatorProps {
  /** Se deve mostrar o seletor de modo */
  showSelector?: boolean;
  
  /** Se deve mostrar status detalhado */
  showDetailedStatus?: boolean;
  
  /** Callback quando o modo muda */
  onModeChange?: (mode: "auto" | "online" | "offline") => void;
  
  /** Posição do componente */
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
}

// ============================================================
// Constants
// ============================================================

const POSITION_CLASSES = {
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
};

// ============================================================
// Component
// ============================================================

/**
 * Componente ModelStatusIndicator
 */
export function ModelStatusIndicator({
  showSelector = true,
  showDetailedStatus = false,
  onModeChange,
  position = "top-right",
}: ModelStatusIndicatorProps) {
  const {
    mode,
    isOnline,
    isLocal,
    webGPUSupported,
    localModelStatus,
    modelId,
    error,
    setAutoMode,
    setOnlineMode,
    setOfflineMode,
    refreshStatus,
  } = useModelMode();

  const [isMounted, setIsMounted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Marca como montado para evitar flash de conteúdo
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Chama callback quando modo muda
  useEffect(() => {
    if (onModeChange) {
      onModeChange(mode);
    }
  }, [mode, onModeChange]);

  // Obtém cor do status
  const statusColor = getStatusColor(mode, isOnline);

  // Obtém label do status
  const statusLabel = getStatusLabel(mode, isOnline, webGPUSupported);

  // Obtém mensagem de status detalhado
  const getDetailedStatusMessage = (): string => {
    if (isLocal) {
      switch (localModelStatus) {
        case "loading":
          return "Baixando modelo... (1ª vez)";
        case "loaded":
          return `Modelo carregado: ${modelId}`;
        case "error":
          return `Erro: ${error || "Falha ao carregar modelo"}`;
        default:
          return "Modelo local pronto";
      }
    }

    if (!isOnline) {
      return "Sem conexão - Modo offline disponível";
    }

    return `Online: ${modelId}`;
  };

  // Obtém ícone do status
  const getStatusIcon = (): JSX.Element => {
    if (isLocal) {
      return (
        <span className="text-sm font-bold">
          {localModelStatus === "loading" ? "⏳" : "🔵"}
        </span>
      );
    }

    if (!isOnline) {
      return <span className="text-sm font-bold">⚠️</span>;
    }

    return <span className="text-sm font-bold">{mode === "online" ? "🟢" : "🔄"}</span>;
  };

  // Handle modo change
  const handleModeChange = (newMode: "auto" | "online" | "offline") => {
    switch (newMode) {
      case "auto":
        setAutoMode();
        break;
      case "online":
        setOnlineMode();
        break;
      case "offline":
        setOfflineMode();
        break;
    }
    setShowTooltip(false);
  };

  // Se não estiver montado, não renderiza
  if (!isMounted) {
    return null;
  }

  return (
    <div className={`fixed ${POSITION_CLASSES[position]} z-50`}>
      <div
        className="relative flex items-center gap-2"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Indicador de status */}
        <div
          className={`
            flex items-center gap-1 px-3 py-1 rounded-full text-white text-xs font-medium
            ${statusColor}
            cursor-pointer hover:opacity-80 transition-opacity
          `}
          onClick={() => setShowTooltip(!showTooltip)}
        >
          {getStatusIcon()}
          <span>{statusLabel}</span>
        </div>

        {/* Tooltip com detalhes e seletor */}
        {showTooltip && (
          <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50">
            {/* Status detalhado */}
            {showDetailedStatus && (
              <div className="mb-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {getDetailedStatusMessage()}
                </p>
                {error && (
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                )}
              </div>
            )}

            {/* Seletor de modo */}
            {showSelector && (
              <div className="space-y-2">
                <button
                  onClick={() => handleModeChange("auto")}
                  className={`
                    w-full text-left px-3 py-2 rounded text-sm transition-colors
                    ${mode === "auto" 
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" 
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }
                  `}
                >
                  🔄 Auto (detecta conexão)
                </button>
                
                <button
                  onClick={() => handleModeChange("online")}
                  className={`
                    w-full text-left px-3 py-2 rounded text-sm transition-colors
                    ${mode === "online" 
                      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" 
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }
                  `}
                >
                  🟢 Online (Groq - gpt-oss-120b)
                </button>
                
                <button
                  onClick={() => handleModeChange("offline")}
                  disabled={!webGPUSupported}
                  className={`
                    w-full text-left px-3 py-2 rounded text-sm transition-colors
                    ${mode === "offline" 
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" 
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }
                    ${!webGPUSupported ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  {webGPUSupported ? "🔵 Offline (WebGPU)" : "🔵 Offline (CPU - mais lento)"}
                </button>
              </div>
            )}

            {/* Info de modelo */}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Modelo: {modelId}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                WebGPU: {webGPUSupported ? "✓" : "✗"}
              </p>
            </div>

            {/* Botão de refresh */}
            <button
              onClick={refreshStatus}
              className="mt-2 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              🔄 Atualizar status
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Componente simplificado (apenas indicador)
// ============================================================

/**
 * Componente simplificado que mostra apenas o indicador
 */
export function SimpleModelStatusIndicator({
  position = "top-right",
}: Omit<ModelStatusIndicatorProps, "showSelector" | "showDetailedStatus" | "onModeChange">) {
  return (
    <ModelStatusIndicator
      showSelector={false}
      showDetailedStatus={false}
      position={position}
    />
  );
}

// ============================================================
// Componente de notificação de conexão perdida
// ============================================================

/**
 * Componente que mostra notificação quando conexão é perdida
 */
export function ConnectionLostNotification() {
  const { isOnline, shouldSuggestOffline, setOfflineMode } = useModelMode();
  const [showNotification, setShowNotification] = useState(false);

  // Mostra notificação quando conexão é perdida
  useEffect(() => {
    if (!isOnline && shouldSuggestOffline) {
      setShowNotification(true);
    } else {
      setShowNotification(false);
    }
  }, [isOnline, shouldSuggestOffline]);

  if (!showNotification) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div className="bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 max-w-sm shadow-lg">
        <div className="flex items-start gap-3">
          <span className="text-yellow-600 dark:text-yellow-400 text-xl">⚠️</span>
          <div>
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm">
              Conexão perdida
            </h3>
            <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
              Você está offline. Deseja ativar o modo offline com modelo local?
            </p>
            <button
              onClick={() => {
                setOfflineMode();
                setShowNotification(false);
              }}
              className="mt-3 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded transition-colors"
            >
              Ativar Modo Offline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Componente de loading do modelo
// ============================================================

/**
 * Componente que mostra progresso de carregamento do modelo
 */
export interface ModelLoadingIndicatorProps {
  status: LocalModelStatus;
  modelId: string;
  error: string | null;
}

export function ModelLoadingIndicator({
  status,
  modelId,
  error,
}: ModelLoadingIndicatorProps) {
  if (status !== "loading") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded-lg p-4 max-w-sm shadow-lg">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
          <div>
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-sm">
              Carregando modelo...
            </h3>
            <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
              {modelId}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Primeiro download - depois funciona offline!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Export principal
// ============================================================

export default ModelStatusIndicator;
