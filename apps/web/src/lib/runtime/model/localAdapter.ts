/**
 * LocalAdapter - Adaptador para integrar LocalProvider ao Agent Loop real
 * 
 * Este adaptador conecta o LocalProvider (do @plutao/domain) com o fluxo real
 * do model/step.ts, permitindo que o Agent Loop use o modelo local de forma transparente.
 * 
 * Fluxo:
 * 1. ModelSelector determina o provedor (online/offline/auto)
 * 2. Se offline, LocalProvider é instanciado
 * 3. LocalAdapter adapta a interface do LocalProvider para o formato esperado pelo model/step.ts
 * 4. Agent Loop usa o provedor sem saber se é local ou remoto
 */

import type { ModelMessage, ModelStepResult, ModelToolProposal } from "./types";
import { LocalProvider, type LocalModelStatus, getLocalProvider } from "@plutao/domain";

// ============================================================
// Types
// ============================================================

/** Configuração para o adaptador local */
export interface LocalAdapterConfig {
  /** ID do modelo a ser usado */
  modelId: string;
  
  /** Dispositivo: webgpu, cpu, auto */
  device: "webgpu" | "cpu" | "auto";
  
  /** Temperatura para geração */
  temperature: number;
  
  /** Máximo de tokens */
  maxTokens: number;
  
  /** Usar cache no IndexedDB */
  useCache: boolean;
}

/** Estado do adaptador local */
export interface LocalAdapterState {
  /** Se está pronto para usar */
  isReady: boolean;
  
  /** Status do modelo */
  modelStatus: LocalModelStatus;
  
  /** ID do modelo */
  modelId: string;
  
  /** Erro (se houver) */
  error: string | null;
}

// ============================================================
// Configuração padrão
// ============================================================

export const DEFAULT_LOCAL_ADAPTER_CONFIG: LocalAdapterConfig = {
  modelId: "Xenova/Llama-3.2-3B-Instruct-q4",
  device: "auto",
  temperature: 0.2,
  maxTokens: 1024,
  useCache: true,
};

// ============================================================
// LocalAdapter Class
// ============================================================

/**
 * LocalAdapter - Adaptador que integra LocalProvider ao fluxo do Agent Loop
 * 
 * Este adaptador:
 * - Mantém uma instância do LocalProvider
 * - Converte chamadas do formato ModelMessage[] para o formato esperado pelo LocalProvider
 * - Converte respostas do LocalProvider para o formato ModelStepResult
 * - Gerencia o ciclo de vida do provider
 */
export class LocalAdapter {
  private provider: LocalProvider;
  private config: LocalAdapterConfig;
  
  /** Estado atual do adaptador */
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

  /**
   * Obtém o estado atual do adaptador
   */
  getState(): LocalAdapterState {
    return {
      ...this.state,
      modelStatus: this.provider.getStatus(),
      error: this.provider.getLoadError(),
    };
  }

  /**
   * Verifica se o adaptador está pronto para uso
   */
  isReady(): boolean {
    const status = this.provider.getStatus();
    return status === "loaded" || status === "idle";
  }

  /**
   * Verifica se o modelo está carregado
   */
  isModelLoaded(): boolean {
    return this.provider.getStatus() === "loaded";
  }

  /**
   * Obtém o status do modelo
   */
  getModelStatus(): LocalModelStatus {
    return this.provider.getStatus();
  }

  /**
   * Obtém o ID do modelo
   */
  getModelId(): string {
    return this.config.modelId;
  }

  /**
   * Obtém o tipo do provedor
   */
  getProviderType(): "groq" | "local" {
    return "local";
  }

  /**
   * Inicializa o provider (carrega modelo se necessário)
   * Usa lazy loading - só carrega quando realmente necessário
   */
  async initialize(): Promise<void> {
    // O LocalProvider já faz lazy loading internamente
    // Aqui só garantimos que o provider está instanciado
    // O carregamento real acontece na primeira chamada a callModel
    this.state.isReady = true;
  }

  /**
   * Chama o modelo local com mensagens
   * 
   * Converte:
   * - Entrada: ModelMessage[] (formato do model/step.ts)
   * - Saída: ModelStepResult (formato esperado pelo model/step.ts)
   */
  async callModel(messages: ModelMessage[]): Promise<ModelStepResult> {
    try {
      // Verifica se estamos no navegador
      if (typeof window === "undefined") {
        throw new Error("LocalAdapter requires browser environment");
      }

      // Chama o LocalProvider
      const result = await this.provider.callModel(messages);

      if (!result.ok) {
        throw new Error(result.error || "Local model call failed");
      }

      // Converte para ModelStepResult
      const toolProposal = this.parseToolProposal(result.toolProposal);

      return {
        provider: "local",
        model: this.config.modelId,
        content: result.output || "",
        toolProposal,
        usage: {
          // Estimativa - LocalProvider não retorna usage real
          promptTokens: undefined,
          completionTokens: undefined,
        },
        latencyMs: 0, // Não medido pelo LocalProvider atualmente
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.state.error = errorMessage;
      
      // Retorna erro no formato esperado
      throw new Error(`LOCAL_MODEL_ERROR: ${errorMessage}`);
    }
  }

  /**
   * Parseia tool proposal do formato do LocalProvider para ModelToolProposal
   */
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

  /**
   * Verifica se o WebGPU está disponível
   */
  async checkWebGPUSupport(): Promise<boolean> {
    return LocalProvider.checkWebGPUSupport();
  }

  /**
   * Libera recursos do provider
   */
  async dispose(): Promise<void> {
    await this.provider.dispose();
    this.state.isReady = false;
  }
}

// ============================================================
// Singleton para uso global
// ============================================================

let localAdapterInstance: LocalAdapter | null = null;

/**
 * Obtém ou cria a instância singleton do LocalAdapter
 */
export function getLocalAdapter(config?: Partial<LocalAdapterConfig>): LocalAdapter {
  if (!localAdapterInstance) {
    localAdapterInstance = new LocalAdapter(config);
  }
  return localAdapterInstance;
}

/**
 * Reseta a instância singleton
 */
export function resetLocalAdapter(): void {
  if (localAdapterInstance) {
    localAdapterInstance.dispose();
    localAdapterInstance = null;
  }
}

// ============================================================
// Factory para criar adaptador com configuração específica
// ============================================================

/**
 * Cria um novo LocalAdapter com configuração personalizada
 */
export function createLocalAdapter(config?: Partial<LocalAdapterConfig>): LocalAdapter {
  return new LocalAdapter(config);
}
