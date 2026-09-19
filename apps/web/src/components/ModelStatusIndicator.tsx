/**
 * ModelStatusIndicator - Componente para mostrar status do modelo
 *
 * Exibe:
 * - Status online/offline
 * - Modo atual (auto, online, offline)
 * - Status de carregamento do modelo local
 * - Indicador de WebGPU
 */

"use client";

import { LocalModelStatus } from "@plutao/domain";

export interface ModelStatusIndicatorProps {
  mode: "auto" | "online" | "offline";
  isOnline: boolean;
  isLocal: boolean;
  webGPUSupported: boolean;
  localModelStatus: LocalModelStatus | null;
  modelId: string;
  error: string | null;
  compact?: boolean;
}

export function ModelStatusIndicator({
  mode,
  isOnline,
  isLocal,
  webGPUSupported,
  localModelStatus,
  modelId,
  error,
  compact = false,
}: ModelStatusIndicatorProps) {
  const getStatusColor = () => {
    if (mode === "offline") {
      return "bg-blue-500";
    }
    if (mode === "online" && isOnline) {
      return "bg-green-500";
    }
    if (!isOnline) {
      return "bg-yellow-500";
    }
    return "bg-gray-500";
  };

  const getStatusLabel = () => {
    if (mode === "offline") {
      return webGPUSupported ? "OFFLINE (WebGPU)" : "OFFLINE (CPU)";
    }
    if (mode === "online" && isOnline) {
      return "ONLINE";
    }
    if (!isOnline) {
      return "Sem conexão";
    }
    return "AUTO";
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span className="text-gray-600 dark:text-gray-400">{getStatusLabel()}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`} />
        <span className="font-medium">{getStatusLabel()}</span>
      </div>
      {isLocal && localModelStatus && (
        <div className="text-xs text-gray-500 dark:text-gray-400 ml-4">
          Modelo: {modelId} ({localModelStatus})
        </div>
      )}
      {error && (
        <div className="text-xs text-red-500 ml-4">{error}</div>
      )}
    </div>
  );
}

export interface ModelLoadingIndicatorProps {
  status: LocalModelStatus;
  modelId: string;
  error: string | null;
}

export function ModelLoadingIndicator({
  status,
  modelId,
  error: _error,
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
            <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">{modelId}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Primeiro download - depois funciona offline!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModelStatusIndicator;
