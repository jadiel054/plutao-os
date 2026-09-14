/**
 * Model Selector - Seletor Híbrido de Modelos
 * 
 * Gerencia a seleção entre provedores de modelo (Online vs Offline).
 * Implementa detecção automática de conexão e persistência de preferência do usuário.
 * 
 * Modos:
 * - auto: Detecta conexão automaticamente (online com internet, offline sem)
 * - online: Force uso exclusivo do Groq (ou outro provedor online)
 * - offline: Force uso do modelo local (Transformers.js + WebGPU)
 */

// ============================================================
// Types
// ============================================================
// WebGPU Type Declaration
// ============================================================

declare global {
  interface Navigator {
    gpu?: {
      requestAdapter: () => Promise<unknown>;
    };
  }
}
// ============================================================

/** Modos de seleção de modelo */
export type ModelMode = "auto" | "online" | "offline";

/** Resultado da seleção do provedor */
export interface ModelProviderSelection {
  /** Modo selecionado */
  mode: ModelMode;
  
  /** Tipo do provedor: "groq", "local", etc. */
  providerType: "groq" | "local";
  
  /** ID do modelo a ser usado */
  modelId: string;
  
  /** Se está usando conexão online */
  isOnline: boolean;
  
  /** Se está usando modelo local */
  isLocal: boolean;
}

/** Configuração do seletor */
export interface ModelSelectorConfig {
  /** Modo padrão (default: "auto") */
  defaultMode: ModelMode;
  
  /** ID do modelo para modo offline */
  offlineModelId: string;
  
  /** ID do modelo para modo online */
  onlineModelId: string;
  
  /** Chave para persistência no localStorage */
  storageKey: string;
}

// ============================================================
// Constants
// ============================================================

/** Modo padrão */
export const DEFAULT_MODEL_MODE: ModelMode = "auto";

/** ID do modelo padrão para offline */
export const DEFAULT_OFFLINE_MODEL_ID = "Xenova/Llama-3.2-3B-Instruct-q4";

/** ID do modelo padrão para online */
export const DEFAULT_ONLINE_MODEL_ID = "openai/gpt-oss-120b";

/** Chave de armazenamento da preferência do usuário */
export const STORAGE_KEY = "plutao:modelMode";

/** Configuração padrão */
export const DEFAULT_SELECTOR_CONFIG: ModelSelectorConfig = {
  defaultMode: DEFAULT_MODEL_MODE,
  offlineModelId: DEFAULT_OFFLINE_MODEL_ID,
  onlineModelId: DEFAULT_ONLINE_MODEL_ID,
  storageKey: STORAGE_KEY,
};

// ============================================================
// Connection Detection
// ============================================================

/**
 * Verifica se há conexão com a internet
 * Usa a API Navigator.onLine e faz um ping para verificar conectividade real
 */
export async function checkOnlineStatus(): Promise<boolean> {
  // Verifica se estamos no navegador
  if (typeof window === "undefined" || !window.navigator) {
    // No servidor, assume que está online (para não bloquear)
    return true;
  }

  // Verifica estado do navegador
  if (!window.navigator.onLine) {
    return false;
  }

  // Faz um ping para verificar conectividade real
  try {
    // Usa um endpoint leve para ping
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch("https://api.groq.com/v1/models", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Verifica se o WebGPU está disponível
 */
export async function checkWebGPUSupport(): Promise<boolean> {
  if (typeof window === "undefined" || !window.navigator) {
    return false;
  }

  
  if (!window.navigator.gpu) {
    return false;
  }

  try {
    
    const adapter = await window.navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// ============================================================
// Storage Utilities
// ============================================================

/**
 * Obtém o modo salvo no localStorage
 */
export function getStoredMode(storageKey: string = STORAGE_KEY): ModelMode | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && (stored === "auto" || stored === "online" || stored === "offline")) {
      return stored as ModelMode;
    }
  } catch {
    // Ignora erro de localStorage
  }

  return null;
}

/**
 * Salva o modo no localStorage
 */
export function saveMode(mode: ModelMode, storageKey: string = STORAGE_KEY): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // Ignora erro de localStorage
  }
}

/**
 * Remove o modo salvo do localStorage
 */
export function clearStoredMode(storageKey: string = STORAGE_KEY): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignora erro de localStorage
  }
}

// ============================================================
// Model Selector
// ============================================================

/**
 * Seletor de modelos - gerencia a seleção entre provedores
 */
export class ModelSelector {
  private config: ModelSelectorConfig;
  private mode: ModelMode;
  private isOnline: boolean | null = null;
  private webGPUSupported: boolean | null = null;

  constructor(config: Partial<ModelSelectorConfig> = {}) {
    this.config = {
      ...DEFAULT_SELECTOR_CONFIG,
      ...config,
    };
    
    // Carrega modo do localStorage ou usa padrão
    const storedMode = getStoredMode(this.config.storageKey);
    this.mode = storedMode || this.config.defaultMode;
  }

  /**
   * Obtém o modo atual
   */
  getMode(): ModelMode {
    return this.mode;
  }

  /**
   * Define o modo manualmente
   */
  setMode(mode: ModelMode): void {
    this.mode = mode;
    saveMode(mode, this.config.storageKey);
    this.isOnline = null; // Reseta cache de status
  }

  /**
   * Obtém o status de conexão (com cache)
   */
  async getOnlineStatus(): Promise<boolean> {
    if (this.isOnline !== null) {
      return this.isOnline;
    }

    this.isOnline = await checkOnlineStatus();
    return this.isOnline;
  }

  /**
   * Obtém o status de suporte a WebGPU (com cache)
   */
  async getWebGPUSupport(): Promise<boolean> {
    if (this.webGPUSupported !== null) {
      return this.webGPUSupported;
    }

    this.webGPUSupported = await checkWebGPUSupport();
    return this.webGPUSupported;
  }

  /**
   * Seleciona o provedor de modelo com base no modo atual
   */
  async selectProvider(): Promise<ModelProviderSelection> {
    const mode = this.mode;
    const isOnline = mode === "online" || (mode === "auto" && await this.getOnlineStatus());
    const webGPUSupported = await this.getWebGPUSupport();

    if (mode === "offline" || !isOnline) {
      // Modo offline ou sem conexão
      return {
        mode: isOnline ? "offline" : "auto",
        providerType: "local",
        modelId: this.config.offlineModelId,
        isOnline: false,
        isLocal: true,
      };
    }

    // Modo online
    return {
      mode,
      providerType: "groq",
      modelId: this.config.onlineModelId,
      isOnline: true,
      isLocal: false,
    };
  }

  /**
   * Obtém a configuração para o provedor atual
   */
  async getCurrentConfig(): Promise<{
    mode: ModelMode;
    useLocal: boolean;
    useOnline: boolean;
    modelId: string;
    webGPUSupported: boolean;
  }> {
    const selection = await this.selectProvider();
    const webGPUSupported = await this.getWebGPUSupport();

    return {
      mode: this.mode,
      useLocal: selection.isLocal,
      useOnline: selection.isOnline,
      modelId: selection.modelId,
      webGPUSupported,
    };
  }

  /**
   * Verifica se o modo offline é viável (WebGPU ou CPU disponível)
   */
  async isOfflineFeasible(): Promise<boolean> {
    // No navegador, sempre é viável (pelo menos com CPU)
    if (typeof window !== "undefined") {
      return true;
    }
    return false;
  }

  /**
   * Sugere trocar para modo offline (quando conexão é perdida)
   */
  async shouldSuggestOffline(): Promise<boolean> {
    if (this.mode === "offline") {
      return false;
    }

    const isOnline = await this.getOnlineStatus();
    const isFeasible = await this.isOfflineFeasible();

    return !isOnline && isFeasible;
  }

  /**
   * Reseta o cache de status
   */
  resetCache(): void {
    this.isOnline = null;
    this.webGPUSupported = null;
  }
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Cria uma instância do ModelSelector com configuração padrão
 */
export function createModelSelector(config?: Partial<ModelSelectorConfig>): ModelSelector {
  return new ModelSelector(config);
}

// ============================================================
// Singleton para uso global
// ============================================================

/** Instância singleton do ModelSelector */
let modelSelectorInstance: ModelSelector | null = null;

/**
 * Obtém ou cria a instância singleton do ModelSelector
 */
export function getModelSelector(config?: Partial<ModelSelectorConfig>): ModelSelector {
  if (!modelSelectorInstance) {
    modelSelectorInstance = createModelSelector(config);
  }
  return modelSelectorInstance;
}

/**
 * Reseta a instância singleton
 */
export function resetModelSelector(): void {
  if (modelSelectorInstance) {
    modelSelectorInstance.resetCache();
    modelSelectorInstance = null;
  }
}

// ============================================================
// Função principal de seleção
// ============================================================

/**
 * Função principal para obter o provedor de modelo com base no modo
 * 
 * @param mode - Modo desejado (auto, online, offline). Se não fornecido, usa o padrão
 * @returns O provedor de modelo apropriado
 * 
 * Uso:
 * ```typescript
 * import { getModelProvider } from "@plutao/domain";
 * 
 * const provider = await getModelProvider("auto");
 * const result = await provider.callModel(messages);
 * ```
 */
export async function getModelProvider(mode?: ModelMode): Promise<{
  provider: any; // ModelProvider (GroqProvider ou LocalProvider)
  mode: ModelMode;
  modelId: string;
  isOnline: boolean;
  isLocal: boolean;
}> {
  // Obtém seletor
  const selector = getModelSelector();
  
  // Define modo se fornecido
  if (mode) {
    selector.setMode(mode);
  }
  
  // Seleciona provedor
  const selection = await selector.selectProvider();
  
  // Importa provedores dinamicamente para evitar dependência circular
  // e carregamento desnecessário no servidor
  
  if (selection.isLocal) {
    // Carrega LocalProvider
    const { LocalProvider } = await import("./providers/localProvider");
    const provider = new LocalProvider({
      modelId: selection.modelId,
      device: "auto",
      temperature: 0.2,
      maxTokens: 1024,
      useCache: true,
    });
    
    return {
      provider,
      mode: selection.mode,
      modelId: selection.modelId,
      isOnline: false,
      isLocal: true,
    };
  }
  
  // Para online, retornamos a configuração - o GroqProvider já existe
  // e não precisa ser instanciado aqui (é gerenciado separadamente)
  // Retornamos null para provider e o chamador deve usar o GroqProvider existente
  return {
    provider: null,
    mode: selection.mode,
    modelId: selection.modelId,
    isOnline: true,
    isLocal: false,
  };
}
