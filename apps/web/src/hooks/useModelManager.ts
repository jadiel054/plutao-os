/**
 * useModelManager — Hook React para gerenciamento completo de modelos de IA
 * Suporta download com progresso em tempo real, filtros Hugging Face, ações por modelo e testes.
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AIModel,
  PRESET_MODELS,
  ModelFilterOptions,
  ModelDownloadProgress,
  filterModels,
  getLocalProvider,
} from "@plutao/domain";
import {
  warmLocalModel,
  deleteCachedModelFiles,
  type DownloadProgressSnapshot,
} from "@/lib/localModels/downloadManager";

type CancelRegistry = Map<string, () => void>;
const cancelledModels = new Set<string>();

const DOWNLOADED_MODELS_KEY = "plutao_downloaded_models";
const ACTIVE_MODEL_KEY = "plutao_active_model_id";

/** Downloads em curso (modelId → promise); evita duplicação e habilita cancelamento. */
const activeDownloads = new Map<string, Promise<unknown>>();

export interface TestResult {
  output: string;
  latencyMs: number;
  tokensGenerated?: number;
  error?: string;
}

export function startDownloadAction(
  model: AIModel,
  setProgresses: React.Dispatch<React.SetStateAction<Record<string, ModelDownloadProgress>>>
) {
  if (model.providerType === "cloud" || model.comingSoon) return;

  setProgresses((prev) => ({
    ...prev,
    [model.id]: {
      modelId: model.id,
      status: "downloading",
      progress: 0,
      loadedBytes: 0,
      totalBytes: model.sizeBytes || 1000000000,
      speedMBs: 0,
    },
  }));
}

export function useModelManager() {
  const [downloadedModelIds, setDownloadedModelIds] = useState<string[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>("groq/gpt-oss-120b");
  const [progresses, setProgresses] = useState<Record<string, ModelDownloadProgress>>({});
  const [filterOptions, setFilterOptions] = useState<ModelFilterOptions>({
    search: "",
    provider: "all",
    category: "all",
    status: "all",
    sortBy: "name",
  });

  // Estado de teste de modelo
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Load saved state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedDownloaded = localStorage.getItem(DOWNLOADED_MODELS_KEY);
      if (savedDownloaded) {
        setDownloadedModelIds(JSON.parse(savedDownloaded));
      } else {
        // Modelos locais agora requerem download explicito pelo usuario
        const initial: string[] = [];
        setDownloadedModelIds(initial);
        localStorage.setItem(DOWNLOADED_MODELS_KEY, JSON.stringify(initial));
      }

      const savedActive = localStorage.getItem(ACTIVE_MODEL_KEY);
      if (savedActive) {
        setActiveModelId(savedActive);
      }
    } catch {
      /* ignore storage error */
    }

    // Carregar preferência do servidor
    fetch("/api/user/preferences", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.preferredModel && typeof data.preferredModel === "string") {
          setActiveModelId(data.preferredModel);
          try {
            localStorage.setItem(ACTIVE_MODEL_KEY, data.preferredModel);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* ignore fetch error */
      });
  }, []);

  // Save downloaded models list
  const saveDownloadedIds = useCallback((ids: string[]) => {
    setDownloadedModelIds(ids);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(DOWNLOADED_MODELS_KEY, JSON.stringify(ids));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Activate Model
  const activateModel = useCallback(async (modelId: string) => {
    const response = await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredModel: modelId }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errMessage = data?.error || `Falha ao salvar preferência de modelo (HTTP ${response.status})`;
      throw new Error(errMessage);
    }

    const data = await response.json().catch(() => ({}));
    const activeId = data?.preferredModel ?? modelId;

    setActiveModelId(activeId);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(ACTIVE_MODEL_KEY, activeId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Start Download — REAL: baixa os arquivos do HF para o cache do navegador
  // com progresso em bytes reais; marca "downloaded" somente após sucesso.
  const startDownload = useCallback((model: AIModel) => {
    if (model.providerType !== "local" || model.comingSoon || !model.hfRepo) return;
    if (activeDownloads.has(model.id)) return;

    cancelledModels.delete(model.id);
    setProgresses((prev) => ({
      ...prev,
      [model.id]: {
        modelId: model.id,
        status: "downloading",
        progress: 0,
        loadedBytes: 0,
        totalBytes: model.sizeBytes || 0,
        speedMBs: 0,
      },
    }));

    const onProgress = (snapshot: DownloadProgressSnapshot) => {
      setProgresses((prev) => ({
        ...prev,
        [model.id]: {
          modelId: model.id,
          status: "downloading",
          progress: snapshot.progress,
          loadedBytes: snapshot.loadedBytes,
          totalBytes: snapshot.totalBytes || model.sizeBytes || 0,
          speedMBs: snapshot.speedMBs,
        },
      }));
    };

    const isCancelled = () => cancelledModels.has(model.id);

    const promise = warmLocalModel({ hfRepo: model.hfRepo, device: "auto", onProgress, isCancelled })
      .then((result) => {
        activeDownloads.delete(model.id);
        if (isCancelled() || (result as { cancelled?: boolean }).cancelled) {
          setProgresses((prev) => {
            const copy = { ...prev };
            delete copy[model.id];
            return copy;
          });
          return;
        }
        if (result.ok) {
          setDownloadedModelIds((prev) => {
            if (prev.includes(model.id)) return prev;
            const next = [...prev, model.id];
            if (typeof window !== "undefined") {
              try { localStorage.setItem(DOWNLOADED_MODELS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            }
            return next;
          });
          setProgresses((prev) => {
            const copy = { ...prev };
            delete copy[model.id];
            return copy;
          });
        } else {
          setProgresses((prev) => ({
            ...prev,
            [model.id]: {
              modelId: model.id,
              status: "error",
              progress: 0,
              loadedBytes: 0,
              totalBytes: model.sizeBytes || 0,
              speedMBs: 0,
              error: result.error,
            },
          }));
        }
      })
      .catch(() => {
        activeDownloads.delete(model.id);
        setProgresses((prev) => ({
          ...prev,
          [model.id]: {
            modelId: model.id,
            status: "error",
            progress: 0,
            loadedBytes: 0,
            totalBytes: model.sizeBytes || 0,
            speedMBs: 0,
            error: "Falha inesperada no download.",
          },
        }));
      });

    activeDownloads.set(model.id, promise);
  }, []);

  // Pause / Cancel Download — interrompe a contabilização e agenda a limpeza
  // dos arquivos já cacheados (limitação: o arquivo em curso do Transformers.js
  // termina; os bytes parciais são removidos do Cache API em seguida).
  const cancelDownload = useCallback((modelId: string) => {
    cancelledModels.add(modelId);
    activeDownloads.delete(modelId);
    setProgresses((prev) => {
      const copy = { ...prev };
      delete copy[modelId];
      return copy;
    });
    const model = PRESET_MODELS.find((m) => m.id === modelId);
    if (model?.hfRepo) void deleteCachedModelFiles(model.hfRepo);
  }, []);

  // Delete local model cache — remove estado E os arquivos reais do Cache API
  const deleteModel = useCallback((modelId: string) => {
    cancelledModels.add(modelId);
    activeDownloads.delete(modelId);
    setDownloadedModelIds((prev) => {
      const next = prev.filter((id) => id !== modelId);
      saveDownloadedIds(next);
      return next;
    });
    setProgresses((prev) => {
      const copy = { ...prev };
      delete copy[modelId];
      return copy;
    });
    const model = PRESET_MODELS.find((m) => m.id === modelId);
    if (model?.hfRepo) void deleteCachedModelFiles(model.hfRepo);
  }, [saveDownloadedIds]);

  // Run Test inference
  const runModelTest = useCallback(async (model: AIModel, prompt: string) => {
    setTestingModelId(model.id);
    setIsTesting(true);
    setTestResult(null);

    const startTime = performance.now();

    try {
      if (model.providerType === "local") {
        // Run via LocalProvider from domain
        const provider = getLocalProvider({ modelId: model.id });
        const res = await provider.callModel([
          { role: "user", content: prompt || "Explique o que é o sistema Plutão em 2 frases." },
        ]);
        const latency = Math.round(performance.now() - startTime);

        if (res.ok) {
          setTestResult({
            output: res.output || "Resposta gerada com sucesso pelo modelo local.",
            latencyMs: latency,
            tokensGenerated: (res.output || "").split(/\s+/).length * 2,
          });
        } else {
          setTestResult({
            output: "",
            latencyMs: latency,
            error: res.error || "Falha na resposta do modelo local.",
          });
        }
      } else {
        const response = await fetch("/api/model/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            prompt: prompt || "Explique o sistema Plutão em 2 frases curtas.",
          }),
        });

        const data = await response.json().catch(() => ({}));
        const latency = Math.round(performance.now() - startTime);

        if (response.ok && data.output) {
          setTestResult({
            output: data.output,
            latencyMs: data.latencyMs || latency,
            tokensGenerated: data.tokensGenerated || Math.round((data.output || "").length / 4),
          });
        } else {
          setTestResult({
            output: "",
            latencyMs: data.latencyMs || latency,
            error: data.error || `Falha no teste de inferência real do modelo ${model.name}`,
          });
        }
      }
    } catch (err) {
      const latency = Math.round(performance.now() - startTime);
      setTestResult({
        output: "",
        latencyMs: latency,
        error: err instanceof Error ? err.message : "Erro inesperado ao executar teste do modelo.",
      });
    } finally {
      setIsTesting(false);
    }
  }, []);

  // Filtered models list
  const filteredModels = useMemo(() => {
    return filterModels(PRESET_MODELS, filterOptions, downloadedModelIds);
  }, [filterOptions, downloadedModelIds]);

  // Total counter
  const totalAvailable = PRESET_MODELS.length;
  const totalDownloadedLocal = PRESET_MODELS.filter(
    (m) => m.providerType === "local" && downloadedModelIds.includes(m.id)
  ).length;

  return {
    allModels: PRESET_MODELS,
    filteredModels,
    downloadedModelIds,
    activeModelId,
    progresses,
    filterOptions,
    testingModelId,
    isTesting,
    testResult,
    totalAvailable,
    totalDownloadedLocal,
    setFilterOptions,
    activateModel,
    startDownload,
    cancelDownload,
    deleteModel,
    setTestingModelId,
    runModelTest,
  };
}
