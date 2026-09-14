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

export interface ModelModeState {
  mode: ModelMode;
  isOnline: boolean;
  webGPUSupported: boolean;
  isLocal: boolean;
  localModelStatus: LocalModelStatus | null;
  modelId: string;
  error: string | null;
  isLoading: boolean;
  shouldSuggestOffline: boolean;
}

export interface ModelModeActions {
  setAutoMode: () => void;
  setOnlineMode: () => void;
  setOfflineMode: () => void;
  setMode: (mode: ModelMode) => void;
  refreshStatus: () => Promise<void>;
  initializeLocalModel: () => Promise<void>;
  disposeLocalModel: () => Promise<void>;
}

export interface UseModelModeResult extends ModelModeState, ModelModeActions {}

const LOCAL_STORAGE_KEY = "plutao:modelMode";

export function useModelMode(): UseModelModeResult {
  const [mode, setModeState] = useState<ModelMode>(DEFAULT_MODEL_MODE);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [localProvider, setLocalProvider] = useState<LocalProvider | null>(null);

  useEffect(() => {
    const storedMode = getStoredMode(LOCAL_STORAGE_KEY);
    if (storedMode) {
      setModeState(storedMode);
    }
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const online =
          typeof window !== "undefined" ? (window.navigator?.onLine ?? true) : true;
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

    void checkStatus();
  }, []);

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

  useEffect(() => {
    if (mode !== "offline") {
      setLocalModelStatus(null);
      return;
    }

    let cancelled = false;
    let providerRef: LocalProvider | null = null;

    const initLocal = async () => {
      try {
        const provider = getLocalProvider({
          modelId: DEFAULT_OFFLINE_MODEL_ID,
          device: "auto",
          useCache: true,
        });

        if (cancelled) return;

        providerRef = provider;
        setLocalProvider(provider);
        setLocalModelStatus(provider.getStatus());
        setError(provider.getLoadError());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setLocalModelStatus("error");
      }
    };

    void initLocal();

    return () => {
      cancelled = true;
      if (providerRef) {
        void providerRef.dispose();
      }
      setLocalProvider(null);
    };
  }, [mode]);

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

  const setMode = useCallback(
    (newMode: ModelMode) => {
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
    },
    [setAutoMode, setOnlineMode, setOfflineMode]
  );

  const refreshStatus = useCallback(async () => {
    try {
      const online =
        typeof window !== "undefined" ? (window.navigator?.onLine ?? true) : true;
      const webgpu = await checkWebGPUSupport();

      setIsOnline(online);
      setWebGPUSupported(webgpu);
    } catch {
      // ignore
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

  return {
    mode,
    isOnline,
    webGPUSupported,
    isLocal,
    localModelStatus,
    modelId,
    error,
    isLoading,
    shouldSuggestOffline,
    setAutoMode,
    setOnlineMode,
    setOfflineMode,
    setMode,
    refreshStatus,
    initializeLocalModel,
    disposeLocalModel,
  };
}

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

export function getStatusLabel(
  mode: ModelMode,
  isOnline: boolean,
  webGPUSupported: boolean
): string {
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
