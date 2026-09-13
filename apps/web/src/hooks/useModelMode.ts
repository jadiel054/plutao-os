/**
 * useModelMode - Hook React para gerenciar modo de modelo (Online/Offline)
 *
 * Fornece:
 * - Estado do modo atual (auto, online, offline)
 * - Funções para trocar de modo
 * - Status de conexão e WebGPU
 * - Estado de carregamento do modelo local
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ModelMode,
  resetModelSelector,
  checkWebGPUSupport,
  getStoredMode,
  saveMode,
  DEFAULT_MODEL_MODE,
  DEFAULT_OFFLINE_MODEL_ID,
  DEFAULT_ONLINE_MODEL_ID,
  LocalProvider,
  getLocalProvider,
  resetLocalProvider,
  LocalModelStatus,
} from "@plutao/domain";

// ============================================================
// Types
// ============================================================

/** Estado do hook */
export interface ModelModeState {
  /** Modo atual */
  mode: ModelMode;

  /** Se está online */
  isOnline: boolean;

  /** Se WebGPU está disponível */
  webGPUSupported: boolean;

  /** Se está usando modelo local */
  isLocal: boolean;

  /** Status do modelo local (se aplicável) */
  localModelStatus: LocalModelStatus | null;

  /** ID do modelo atual */
  modelId: string;

  /** Mensagem de erro (se houver) */
  error: string | null;

  /** Se está carregando */
  isLoading: boolean;

  /** Se deve sugerir modo offline (conexão perdida) */
  shouldSuggestOffline: boolean;
}

/** Funções de ação */
export interface ModelModeActions {
  /** Troca para modo auto */
  setAutoMode: () => void;

  /** Troca para modo online */
  setOnlineMode: () => void;

  /** Troca para modo offline */
  setOfflineMode: () => void;

  /** Troca para um modo específico */
  setMode: (mode: ModelMode) => void;

  /** Recarrega status de conexão e WebGPU */
  refreshStatus: () => Promise<void>;

  /** Inicializa o modelo local (quando trocando para offline) */
  initializeLocalModel: () => Promise<void>;

  /** Libera o modelo local */
  disposeLocalModel: () => Promise<void>;
}

/** Resultado completo do hook */
export interface UseModelModeResult extends ModelModeState, ModelModeActions {}

// ============================================================
// Constants
// ============================================================

const LOCAL_STORAGE_KEY = "plutao:modelMode";

// ============================================================
// Hook Implementation
// ============================================================

/**
 * Hook para gerenciar modo de modelo
 */
export function useModelMode(): UseModelModeResult {
  // Estado inicial
  const [mode, setModeState] = useState<ModelMode>(DEFAULT_MODEL_MODE);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Instância do LocalProvider (lazy)
  const [localProvider, setLocalProvider] = useState<LocalProvider | null>(null);

  // Carrega modo salvo do localStorage
  useEffect(() => {
    const storedMode = getStoredMode(LOCAL_STORAGE_KEY);
    if (storedMode) {
      setModeState(storedMode);
    }
  }, []);

  // Verifica status de conexão e WebGPU no mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const online = typeof window !== "undefined"
          ? window.navigator?.onLine ?? true
          : true;
        const webgpu = await checkWebGPUSupport();

        setIsOnline(online);
        setWebGPUSupported(webgpu);
      } catch {
        setIsOnline(true);
        setWebGPUSupported(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, []);

  // Atualiza status de conexão quando o navegador muda
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

  // Atualiza status do LocalProvider quando modo muda
  useEffect(() => {
    if (mode !== "offline") {
      setLocalModelStatus(null);
      return;
    }

    // Inicializa LocalProvider quando modo é offline
    let unsubscribeFn: (() => void) | undefined;
    const initLocal = async () => {
      try {
        const provider = getLocalProvider({
          modelId: DEFAULT_OFFLINE_MODEL_ID,
          device: "auto",
          useCache: true,
        });

        setLocalProvider(provider);
        setLocalModelStatus(provider.getStatus());
        setError(provider.getLoadError());

        // Escuta mudanças de status reativamente
        unsubscribeFn = provider.onStatusChange((newStatus) => {
          setLocalModelStatus(newStatus);
          setError(provider.getLoadError());
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLocalModelStatus("error");
      }
    };

    initLocal();

    return () => {
      if (unsubscribeFn) unsubscribeFn();
      resetLocalProvider();
      setLocalProvider(null);
    };
  }, [mode]);

  // Calcula estado derivado
  const isLocal = useMemo(() => mode === "offline", [mode]);

  const modelId = useMemo(() => {
    if (isLocal) {
      return DEFAULT_OFFLINE_MODEL_ID;
    }
    return DEFAULT_ONLINE_MODEL_ID;
  }, [isLocal]);

  const shouldSuggestOffline = useMemo(() => {
    return mode !== "offline" && !isOnline && webGPUSupported;
  }, [mode, isOnline, webGPUSupported]);

  // Funções de ação
  const setAutoMode = useCallback(() => {
    setModeState("auto");
    saveMode("auto", LOCAL_STORAGE_KEY);
    resetModelSelector();
    resetLocalProvider();
    setLocalProvider(null);
    setLocalModelStatus(null);
  }, []);

  const setOnlineMode = useCallback(() => {
    setModeState("online");
    saveMode("online", LOCAL_STORAGE_KEY);
    resetModelSelector();
    resetLocalProvider();
    setLocalProvider(null);
    setLocalModelStatus(null);
  }, []);

  const setOfflineMode = useCallback(() => {
    setModeState("offline");
    saveMode("offline", LOCAL_STORAGE_KEY);
    resetModelSelector();
    setError(null);
  }, []);

  const setMode = useCallback((newMode: ModelMode) => {
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
  }, [setAutoMode, setOnlineMode, setOfflineMode]);

  const refreshStatus = useCallback(async () => {
    try {
      const online = typeof window !== "undefined"
        ? window.navigator?.onLine ?? true
        : true;
      const webgpu = await checkWebGPUSupport();

      setIsOnline(online);
      setWebGPUSupported(webgpu);
    } catch {
      // Ignora erro
    }
  }, []);

  const initializeLocalModel = useCallback(async () => {
    if (!isLocal) return;

    try {
      const provider = getLocalProvider({
        modelId: DEFAULT_OFFLINE_MODEL_ID,
        device: "auto",
        useCache: true,
      });

      setLocalProvider(provider);
      setLocalModelStatus(provider.getStatus());
      setError(provider.getLoadError());

      // Se não estiver carregado, inicia carregamento
      if (provider.getStatus() === "idle") {
        // O carregamento será feito lazy quando chamar callModel
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLocalModelStatus("error");
    }
  }, [isLocal]);

  const disposeLocalModel = useCallback(async () => {
    if (localProvider) {
      await localProvider.dispose();
      setLocalProvider(null);
      setLocalModelStatus(null);
    }
    resetLocalProvider();
  }, [localProvider]);

  // Retorna estado e ações
  return {
    // Estado
    mode,
    isOnline,
    webGPUSupported,
    isLocal,
    localModelStatus,
    modelId,
    error,
    isLoading,
    shouldSuggestOffline,

    // Ações
    setAutoMode,
    setOnlineMode,
    setOfflineMode,
    setMode,
    refreshStatus,
    initializeLocalModel,
    disposeLocalModel,
  };
}

// ============================================================
// Hook simplificado para componentes que só precisam do status
// ============================================================

/**
 * Hook simplificado para obter apenas o status do modelo
 */
export function useModelStatus(): {
  mode: ModelMode;
  isOnline: boolean;
  isLocal: boolean;
  webGPUSupported: boolean;
  modelId: string;
  localModelStatus: LocalModelStatus | null;
  error: string | null;
} {
  const {
    mode,
    isOnline,
    isLocal,
    webGPUSupported,
    modelId,
    localModelStatus,
    error,
  } = useModelMode();

  return {
    mode,
    isOnline,
    isLocal,
    webGPUSupported,
    modelId,
    localModelStatus,
    error,
  };
}

// ============================================================
// Utilitários
// ============================================================

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
