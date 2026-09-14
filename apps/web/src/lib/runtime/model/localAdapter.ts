/**
 * LocalAdapter - Adaptador para integrar LocalProvider ao Agent Loop real
 *
 * Este adaptador conecta o LocalProvider (do @plutao/domain) com o fluxo real
 * do model/step.ts, permitindo que o Agent Loop use o modelo local de forma transparente.
 */

import type { ModelMessage, ModelStepResult, ModelToolProposal } from "./types";
import { LocalProvider, type LocalModelStatus } from "@plutao/domain";

export interface LocalAdapterConfig {
  modelId: string;
  device: "webgpu" | "cpu" | "auto";
  temperature: number;
  maxTokens: number;
  useCache: boolean;
}

export interface LocalAdapterState {
  isReady: boolean;
  modelStatus: LocalModelStatus;
  modelId: string;
  error: string | null;
}

export const DEFAULT_LOCAL_ADAPTER_CONFIG: LocalAdapterConfig = {
  modelId: "Xenova/Llama-3.2-3B-Instruct-q4",
  device: "auto",
  temperature: 0.2,
  maxTokens: 1024,
  useCache: true,
};

export class LocalAdapter {
  private provider: LocalProvider;
  private config: LocalAdapterConfig;
  private state: LocalAdapterState;

  constructor(config: Partial<LocalAdapterConfig> = {}) {
    this.config = {
      ...DEFAULT_LOCAL_ADAPTER_CONFIG,
      ...config,
    };

    this.provider = new LocalProvider({
      modelId: this.config.modelId,
      device: this.config.device,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      useCache: this.config.useCache,
    });

    this.state = {
      isReady: false,
      modelStatus: this.provider.getStatus(),
      modelId: this.config.modelId,
      error: this.provider.getLoadError(),
    };
  }

  getState(): LocalAdapterState {
    return {
      ...this.state,
      modelStatus: this.provider.getStatus(),
      error: this.provider.getLoadError(),
    };
  }

  isReady(): boolean {
    const status = this.provider.getStatus();
    return status === "loaded" || status === "idle";
  }

  isModelLoaded(): boolean {
    return this.provider.getStatus() === "loaded";
  }

  getModelStatus(): LocalModelStatus {
    return this.provider.getStatus();
  }

  getModelId(): string {
    return this.config.modelId;
  }

  getProviderType(): "groq" | "local" {
    return "local";
  }

  async initialize(): Promise<void> {
    this.state.isReady = true;
  }

  async callModel(messages: ModelMessage[]): Promise<ModelStepResult> {
    try {
      if (typeof window === "undefined") {
        throw new Error("LocalAdapter requires browser environment");
      }

      const result = await this.provider.callModel(messages);

      if (!result.ok) {
        throw new Error(result.error || "Local model call failed");
      }

      const toolProposal = this.parseToolProposal(result.toolProposal);

      return {
        provider: "local",
        model: this.config.modelId,
        content: result.output || "",
        toolProposal,
        usage: {
          promptTokens: undefined,
          completionTokens: undefined,
        },
        latencyMs: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.state.error = errorMessage;
      throw new Error(`LOCAL_MODEL_ERROR: ${errorMessage}`);
    }
  }

  private parseToolProposal(
    proposal: { name: string; input: string } | null | undefined
  ): ModelToolProposal | null {
    if (!proposal) {
      return null;
    }

    return {
      name: proposal.name,
      input: proposal.input,
    };
  }

  async checkWebGPUSupport(): Promise<boolean> {
    return LocalProvider.checkWebGPUSupport();
  }

  async dispose(): Promise<void> {
    await this.provider.dispose();
    this.state.isReady = false;
  }
}

let localAdapterInstance: LocalAdapter | null = null;

export function getLocalAdapter(config?: Partial<LocalAdapterConfig>): LocalAdapter {
  if (!localAdapterInstance) {
    localAdapterInstance = new LocalAdapter(config);
  }
  return localAdapterInstance;
}

export function resetLocalAdapter(): void {
  if (localAdapterInstance) {
    void localAdapterInstance.dispose();
    localAdapterInstance = null;
  }
}

export function createLocalAdapter(config?: Partial<LocalAdapterConfig>): LocalAdapter {
  return new LocalAdapter(config);
}
