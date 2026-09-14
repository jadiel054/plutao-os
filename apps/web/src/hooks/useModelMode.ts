/**
 * useModelMode - Hook React para gerenciar modo de modelo (Online/Offline)
 *
 * Fornece:
 * - Estado do modo atual (auto, online, offline)
 * - Funções para trocar de modo (setAutoMode, setOnlineMode, setOfflineMode)
 * - Status de conexão (isOnline) e suporte a WebGPU (webGPUSupported)
 * - ID do modelo atual (groq/gpt-oss-120b ou huggingface/local)
 * - Estado e erros do modelo local
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ModelMode,
  resetModelSelector,
  checkWebGPUSupport,
  DEFAULT_MODEL_MODE,
  LocalProvider,
  getLocalProvider,
  resetLocalProvider,
  LocalModelStatus,
} from "@plutao/domain";

const LOCAL_STORAGE_KEY = "plutao_model_mode";

/** Estado e ações do hook useModelMode */
export interface UseModelModeResult {
  /** Modo atual: "auto" | "online" | "offline" */
  mode: ModelMode;

  /** Se está online */
  isOnline: boolean;

  /** Se WebGPU está disponível no navegador */
  webGPUSupported: boolean;

  /** ID do modelo ativo: "groq/gpt-oss-120b" (online) ou "huggingface/local" (offline) */
  modelId: string;

  /** Status do modelo local */
  localModelStatus: LocalModelStatus | null;

  /** Mensagem de erro */
  error: string | null;

  /** Alterna para modo automático */
  setAutoMode: () => void;

  /** Alterna para modo online */
  setOnlineMode: () => void;

  /** Alterna para modo offline */
  setOfflineMode: () => void;

  /** Recarrega status de conexão e WebGPU */
  refreshStatus: () => Promise<void>;

  /** Se está usando modelo local */
  isLocal?: boolean;
  /** Se está carregando */
  isLoading?: boolean;
  /** Se deve sugerir modo offline */
  shouldSuggestOffline?: boolean;
  /** Define modo genérico */
  setMode?: (mode: ModelMode) => void;
  /** Inicializa modelo local */
  initializeLocalModel?: () => Promise<void>;
  /** Libera modelo local */
  disposeLocalModel?: () => Promise<void>;
}

export function useModelMode(): UseModelModeResult {
  const [mode, setModeState] = useState<ModelMode>(DEFAULT_MODEL_MODE);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [, setLocalProvider] = useState<LocalProvider | null>(null);

  // Carrega modo salvo do localStorage na chave "plutao_model_mode"
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored === "auto" || stored === "online" || stored === "offline") {
        setModeState(stored as ModelMode);
      }
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // Salva no localStorage
  const saveStoredMode = useCallback((newMode: ModelMode) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, newMode);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // Checa status de WebGPU e Conexão
  const checkStatus = useCallback(async () => {
    const online = typeof window !== "undefined" && typeof navigator !== "undefined"
      ? navigator.onLine
      : true;
    const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;

    setIsOnline(online);
    setWebGPUSupported(Boolean(webgpu));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // Event listeners para online/offline
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Efeito para carregar o LocalProvider quando em modo offline
  useEffect(() => {
    if (mode !== "offline") {
      setLocalModelStatus(null);
      return;
    }

    let unsubscribeFn: (() => void) | undefined;
    const initLocal = async () => {
      try {
        const provider = getLocalProvider({
          modelId: "Xenova/Llama-3.2-3B-Instruct-q4",
          device: "auto",
          useCache: true,
        });

        setLocalProvider(provider);
        setLocalModelStatus(provider.getStatus());
        setError(provider.getLoadError());

        unsubscribeFn = provider.onStatusChange((newStatus) => {
          setLocalModelStatus(newStatus);
          setError(provider.getLoadError());
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLocalModelStatus("error");
      }
    };

    void initLocal();

    return () => {
      if (unsubscribeFn) unsubscribeFn();
      resetLocalProvider();
      setLocalProvider(null);
    };
  }, [mode]);

  const setAutoMode = useCallback(() => {
    setModeState("auto");
    saveStoredMode("auto");
    resetModelSelector();
    resetLocalProvider();
    setLocalProvider(null);
    setLocalModelStatus(null);
  }, [saveStoredMode]);

  const setOnlineMode = useCallback(() => {
    setModeState("online");
    saveStoredMode("online");
    resetModelSelector();
    resetLocalProvider();
    setLocalProvider(null);
    setLocalModelStatus(null);
  }, [saveStoredMode]);

  const setOfflineMode = useCallback(() => {
    setModeState("offline");
    saveStoredMode("offline");
    resetModelSelector();
    setError(null);
  }, [saveStoredMode]);

  const refreshStatus = useCallback(async () => {
    await checkStatus();
    if (typeof checkWebGPUSupport === "function") {
      try {
        const gpuAsync = await checkWebGPUSupport();
        if (gpuAsync) setWebGPUSupported(true);
      } catch {
        /* ignore */
      }
    }
  }, [checkStatus]);

  // modelId: quando online (ou auto com rede) use "groq/gpt-oss-120b"; offline use "huggingface/local"
  const isLocal = useMemo(() => {
    if (mode === "offline") return true;
    if (mode === "auto" && !isOnline) return true;
    return false;
  }, [mode, isOnline]);

  const modelId = useMemo(() => {
    if (isLocal) {
      return "huggingface/local";
    }
    return "groq/gpt-oss-120b";
  }, [isLocal]);

  return {
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
    isLocal,
    isLoading,
  };
}

/**
 * Obtém a cor do status para UI
 */
export function getStatusColor(mode: ModelMode, isOnline: boolean): string {
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
}

/**
 * Obtém o label do status para UI
 */
export function getStatusLabel(mode: ModelMode, isOnline: boolean, webGPUSupported: boolean): string {
  if (mode === "offline") {
    return webGPUSupported ? "OFFLINE (WebGPU)" : "OFFLINE (CPU)";
  }
  if (mode === "online" && isOnline) {
    return "ONLINE (Groq)";
  }
  if (!isOnline) {
    return "Sem conexão";
  }
  return "AUTO";
}
