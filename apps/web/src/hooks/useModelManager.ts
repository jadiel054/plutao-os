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

const DOWNLOADED_MODELS_KEY = "plutao_downloaded_models";
const ACTIVE_MODEL_KEY = "plutao_active_model_id";

export interface TestResult {
  output: string;
  latencyMs: number;
  tokensGenerated?: number;
  error?: string;
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
        setDownloadedModelIds([]);
      }

      const savedActive = localStorage.getItem(ACTIVE_MODEL_KEY);
      if (savedActive) {
        setActiveModelId(savedActive);
      }
    } catch {
      /* ignore storage error */
    }
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
  const activateModel = useCallback((modelId: string) => {
    setActiveModelId(modelId);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(ACTIVE_MODEL_KEY, modelId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Start Download (No fake simulation)
  const startDownload = useCallback((_model: AIModel) => {
    // Local download simulation removed (#113). Local models marked as coming soon.
    return;
  }, []);

  // Pause / Cancel Download
  const cancelDownload = useCallback((modelId: string) => {
    setProgresses((prev) => {
      const copy = { ...prev };
      delete copy[modelId];
      return copy;
    });
  }, []);

  // Delete local model cache
  const deleteModel = useCallback((modelId: string) => {
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
