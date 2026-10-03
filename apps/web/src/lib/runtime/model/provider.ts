/**
 * Model Provider Factory - Fábrica de provedores de modelo
 * 
 * Centraliza a criação e seleção de provedores de modelo (Online/Offline/Auto).
 * 
 * Fluxo:
 * 1. Recebe configuração do ModelSelector
 * 2. Cria o provedor apropriado (GroqProvider ou LocalAdapter)
 * 3. Retorna instância pronta para uso no Agent Loop
 * 
 * Integração:
 * - Usa ModelSelector para determinar o modo
 * - Usa LocalAdapter para modelo local
 * - Usa chatCompletion para modelo online (Groq)
 */

import { getModelConfig } from "./config";
import { chatCompletion } from "./client";
import { LocalAdapter, getLocalAdapter, resetLocalAdapter } from "./localAdapter";
import { getModelSelector, ModelMode } from "@plutao/domain";
import type { ModelMessage, ModelStepResult } from "./types";

// ============================================================
// Types
// ============================================================

/** Configuração do provedor de modelo */
export interface ModelProviderConfig {
  /** Modo de operação */
  mode: ModelMode;
  
  /** Se deve forçar uso local (ignora detecção de conexão) */
  forceLocal?: boolean;
  
  /** ID do modelo local (se modo offline) */
  localModelId?: string;
}

/** Interface do provedor de modelo */
export interface IModelProvider {
  /** Chama o modelo com mensagens */
  callModel(messages: ModelMessage[]): Promise<ModelStepResult>;
  
  /** Verifica se está pronto */
  isReady(): boolean;
  
  /** Obtém ID do modelo */
  getModelId(): string;
  
  /** Obtém provider type */
  getProviderType(): "groq" | "local";
  
  /** Libera recursos */
  dispose?(): Promise<void>;
}

// ============================================================
// GroqProvider - Provedor para modelos online (Groq)
// ============================================================

/**
 * GroqProvider - Implementação do provedor para Groq API
 */
export class GroqProvider implements IModelProvider {
  private config: ReturnType<typeof getModelConfig> | null;
  private modelId: string;

  constructor() {
    this.config = getModelConfig();
    this.modelId = this.config?.model || "openai/gpt-oss-120b";
  }

  isReady(): boolean {
    return !!this.config;
  }

  getModelId(): string {
    return this.modelId;
  }

  getProviderType(): "groq" | "local" {
    return "groq";
  }

  async callModel(messages: ModelMessage[]): Promise<ModelStepResult> {
    const config = this.config;
    
    if (!config) {
      throw new Error("MODEL_NOT_CONFIGURED");
    }

    const result = await chatCompletion(config, messages);
    
    return {
      provider: config.provider,
      model: config.model,
      content: result.content,
      toolProposal: result.toolProposal,
      usage: result.usage,
      latencyMs: result.latencyMs,
    };
  }
}

// ============================================================
// ModelProviderFactory - Fábrica de provedores
// ============================================================

/**
 * ModelProviderFactory - Cria provedores de modelo com base no modo
 */
export class ModelProviderFactory {
  private static groqProvider: GroqProvider | null = null;
  private static localProvider: LocalAdapter | null = null;
  private static currentMode: ModelMode = "auto";

  /**
   * Obtém o provedor de modelo apropriado
   * 
   * @param config - Configuração do provedor
   * @returns Instância do provedor
   */
  static async getProvider(config?: Partial<ModelProviderConfig>): Promise<IModelProvider> {
    // Usa configuração padrão se não fornecida
    const mode = config?.mode || "auto";
    const forceLocal = config?.forceLocal || false;
    const localModelId = config?.localModelId;

    // Atualiza modo atual
    this.currentMode = mode;

    // Determina se deve usar provedor local
    const useLocal = this.shouldUseLocal(mode, forceLocal);

    if (useLocal) {
      // Cria ou reutiliza LocalAdapter
      if (!this.localProvider) {
        this.localProvider = getLocalAdapter({
          modelId: localModelId || "Xenova/Llama-3.2-3B-Instruct-q4",
        });
      }
      
      // Inicializa se necessário
      if (!this.localProvider.isReady()) {
        await this.localProvider.initialize();
      }

      return this.localProvider;
    }

    // Usa GroqProvider
    if (!this.groqProvider) {
      this.groqProvider = new GroqProvider();
    }

    return this.groqProvider;
  }

  /**
   * Determina se deve usar provedor local
   */
  private static shouldUseLocal(mode: ModelMode, forceLocal: boolean): boolean {
    if (forceLocal) return true;
    if (mode === "offline") return true;
    if (mode === "online") return false;
    
    // Modo auto: verifica conexão
    // Usa o ModelSelector para verificar
    try {
      const selector = getModelSelector();
      return !selector.getOnlineStatus();
    } catch {
      // Se não puder verificar, assume online
      return false;
    }
  }

  /**
   * Obtém o modo atual
   */
  static getCurrentMode(): ModelMode {
    return this.currentMode;
  }

  /**
   * Define o modo manualmente
   */
  static setMode(mode: ModelMode): void {
    this.currentMode = mode;
    
    // Reseta provedores para forçar recreação com novo modo
    this.groqProvider = null;
    this.localProvider = null;
  }

  /**
   * Reseta todos os provedores
   */
  static async resetAll(): Promise<void> {
    if (this.localProvider) {
      await this.localProvider.dispose();
      this.localProvider = null;
    }
    this.groqProvider = null;
    this.currentMode = "auto";
    resetLocalAdapter();
  }

  /**
   * Verifica se o provedor atual está pronto
   */
  static async isCurrentProviderReady(): Promise<boolean> {
    const provider = await this.getProvider();
    return provider.isReady();
  }

  /**
   * Obtém ID do modelo atual
   */
  static async getCurrentModelId(): Promise<string> {
    const provider = await this.getProvider();
    return provider.getModelId();
  }

  /**
   * Obtém tipo do provedor atual
   */
  static async getCurrentProviderType(): Promise<"groq" | "local"> {
    const provider = await this.getProvider();
    return provider.getProviderType();
  }
}

// ============================================================
// Funções de conveniência
// ============================================================

/**
 * Obtém o provedor de modelo com base no modo
 */
export async function getModelProvider(mode?: ModelMode): Promise<IModelProvider> {
  return ModelProviderFactory.getProvider({ mode });
}

/**
 * Define o modo do provedor
 */
export function setModelProviderMode(mode: ModelMode): void {
  ModelProviderFactory.setMode(mode);
}

/**
 * Reseta todos os provedores
 */
export async function resetModelProviders(): Promise<void> {
  await ModelProviderFactory.resetAll();
}

/**
 * Obtém o provedor atual
 */
export async function getCurrentModelProvider(): Promise<IModelProvider> {
  return ModelProviderFactory.getProvider();
}

/**
 * Verifica se o provedor atual está pronto
 */
export async function isCurrentModelProviderReady(): Promise<boolean> {
  return ModelProviderFactory.isCurrentProviderReady();
}
