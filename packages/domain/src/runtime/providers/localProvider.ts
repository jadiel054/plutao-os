/**
 * LocalProvider - Provider de modelo OFFLINE usando Transformers.js + WebGPU
 * 
 * Implementa a interface ModelProvider para permitir inferência local no navegador.
 * Usa @huggingface/transformers para carregar modelos quantizados direto no cliente.
 * 
 * Características:
 * - Carregamento preguiçoso (lazy loading) - só carrega quando ativado
 * - Cache do modelo no IndexedDB para uso offline permanente
 * - Suporta WebGPU (preferencial) com fallback para CPU
 * - Tool calling básico via parsing da saída do modelo
 * - Modelos padrão: Llama-3.2-3B-Instruct-q4 ou Phi-3-mini-4k-instruct-q4
 */

// ============================================================
// WebGPU Type Declaration
// ============================================================

/**
 * Declaração de tipos para WebGPU no navegador
 * Isso permite acessar navigator.gpu sem erros de TypeScript
 */
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter: () => Promise<unknown>;
    };
  }
}

// ============================================================
// Types
// ============================================================

/**
 * Configuração do modelo local
 */
export interface LocalModelConfig {
  /** ID do modelo no Hugging Face (ex: "Xenova/Llama-3.2-3B-Instruct-q4") */
  modelId: string;
  
  /** Dispositivo para inferência: "webgpu", "cpu", ou "auto" */
  device: "webgpu" | "cpu" | "auto";
  
  /** Temperatura para geração (0.0 - 1.0) */
  temperature: number;
  
  /** Número máximo de tokens na saída */
  maxTokens: number;
  
  /** Se deve usar cache do modelo no IndexedDB */
  useCache: boolean;
}

/**
 * Estado do carregamento do modelo
 */
export type LocalModelStatus = 
  | "idle"
  | "loading"
  | "loaded"
  | "error";

/**
 * Resultado do parsing de tool proposal do modelo local
 */
interface LocalToolProposal {
  name: string;
  input: string;
}

// ============================================================
// Constants
// ============================================================

/** Modelo padrão para modo offline */
export const DEFAULT_LOCAL_MODEL_ID = "Xenova/Llama-3.2-3B-Instruct-q4";

/** Fallback para modelo offline (mais leve) */
export const FALLBACK_LOCAL_MODEL_ID = "Xenova/Phi-3-mini-4k-instruct-q4";

/** Configuração padrão */
export const DEFAULT_LOCAL_CONFIG: LocalModelConfig = {
  modelId: DEFAULT_LOCAL_MODEL_ID,
  device: "auto",
  temperature: 0.2,
  maxTokens: 1024,
  useCache: true,
};

// ============================================================
// LocalProvider Class
// ============================================================

/**
 * LocalProvider - Implementação da interface ModelProvider para inferência local
 * 
 * NOTA: Este provider é projetado para rodar no navegador (client-side).
 * O carregamento do Transformers.js e do modelo é feito de forma preguiçosa.
 */
export class LocalProvider {
  private modelId: string;
  private device: "webgpu" | "cpu" | "auto";
  private temperature: number;
  private maxTokens: number;
  private useCache: boolean;
  
  /** Pipeline de geração de texto do Transformers.js */
  private pipeline: any | null = null;
  
  /** Estado de carregamento */
  private status: LocalModelStatus = "idle";
  
  /** Erro de carregamento (se houver) */
  private loadError: string | null = null;
  
  /** Indica se o Transformers.js já foi importado */
  private transformersLoaded: boolean = false;

  /** Módulo Transformers.js importado dinamicamente (somente no navegador) */
  private transformersModule: any | null = null;
  
  /** Promessa do carregamento do Transformers.js (separada do pipeline) */
  private transformersPromise: Promise<void> | null = null;

  /** Promessa do carregamento do pipeline de geração */
  private pipelinePromise: Promise<void> | null = null;

  constructor(config: Partial<LocalModelConfig> = {}) {
    this.modelId = config.modelId || DEFAULT_LOCAL_CONFIG.modelId;
    this.device = config.device || DEFAULT_LOCAL_CONFIG.device;
    this.temperature = config.temperature ?? DEFAULT_LOCAL_CONFIG.temperature;
    this.maxTokens = config.maxTokens ?? DEFAULT_LOCAL_CONFIG.maxTokens;
    this.useCache = config.useCache ?? DEFAULT_LOCAL_CONFIG.useCache;
  }

  /**
   * Obtém o status atual do modelo
   */
  getStatus(): LocalModelStatus {
    return this.status;
  }

  /**
   * Obtém a mensagem de erro de carregamento (se houver)
   */
  getLoadError(): string | null {
    return this.loadError;
  }

  /**
   * Obtém o ID do modelo atual
   */
  getModelId(): string {
    return this.modelId;
  }

  /**
   * Verifica se WebGPU está disponível no navegador
   */
  static async checkWebGPUSupport(): Promise<boolean> {
    // Verifica se estamos no navegador
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

  /**
   * Determina o dispositivo ideal para inferência
   */
  private async resolveDevice(): Promise<"webgpu" | "cpu"> {
    if (this.device === "webgpu") {
      const supported = await LocalProvider.checkWebGPUSupport();
      return supported ? "webgpu" : "cpu";
    }
    
    if (this.device === "cpu") {
      return "cpu";
    }

    // Auto: tenta WebGPU primeiro, fallback para CPU
    const supported = await LocalProvider.checkWebGPUSupport();
    return supported ? "webgpu" : "cpu";
  }

  /**
   * Carrega o Transformers.js dinamicamente (só no navegador)
   * Usa import() dinâmico para evitar bundle desnecessário no servidor
   */
  private async loadTransformers(): Promise<void> {
    // Já carregado
    if (this.transformersLoaded) {
      return;
    }

    // Evita múltiplos carregamentos simultâneos (promise dedicada: não compartilha
    // estado com o carregamento do pipeline, que tem ciclo de vida próprio).
    if (this.transformersPromise) {
      return this.transformersPromise;
    }

    const promise = (async () => {
      try {
        // Verifica se estamos no navegador
        if (typeof window === "undefined") {
          throw new Error("LocalProvider requires browser environment");
        }

        // Importa Transformers.js dinamicamente e guarda a referência do módulo.
        // (import() dinâmico NÃO define nada em window; guardar em campo de instância.)
        this.transformersModule = await import("@huggingface/transformers");

        this.transformersLoaded = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        this.loadError = "Failed to load Transformers.js: " + errorMessage;
        this.status = "error";
        throw new Error(this.loadError);
      }
    })();
    this.transformersPromise = promise;
    try {
      await promise;
    } finally {
      this.transformersPromise = null;
    }
  }

  /**
   * Carrega o modelo de geração de texto
   */
  private async loadPipeline(): Promise<void> {
    // Já carregado
    if (this.pipeline) {
      return;
    }

    // Evita múltiplos carregamentos simultâneos: chamadas concorrentes aguardam
    // a MESMA promise em andamento (sem recursão e sem reutilizar a promise
    // atual dentro dela própria, o que causava ciclo).
    if (this.pipelinePromise) {
      return this.pipelinePromise;
    }

    const promise = (async () => {
      // Tentativas SEQUENCIAIS: modelo primário primeiro, fallback leve depois.
      const candidates =
        this.modelId !== FALLBACK_LOCAL_MODEL_ID
          ? [this.modelId, FALLBACK_LOCAL_MODEL_ID]
          : [this.modelId];
      let lastError = "Failed to load local model";

      for (const candidate of candidates) {
        try {
          this.status = "loading";
          this.loadError = null;

          // Carrega Transformers.js
          await this.loadTransformers();

          // Resolve dispositivo
          const resolvedDevice = await this.resolveDevice();

          const pipeline = this.transformersModule?.pipeline;
          if (typeof pipeline !== "function") {
            throw new Error("Transformers.js pipeline not available");
          }

          // Carrega o pipeline de geração de texto
          const loaded = await pipeline("text-generation", candidate, {
            device: resolvedDevice,
            cache: this.useCache ? "indexeddb" : undefined,
          });

          // Só publica estado após sucesso do candidato.
          this.modelId = candidate;
          this.pipeline = loaded;
          this.status = "loaded";
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          lastError = "Failed to load model " + candidate + ": " + errorMessage;
          this.loadError = lastError;
          this.pipeline = null;
          if (candidate !== candidates[candidates.length - 1]) {
            console.warn("Model " + candidate + " failed, trying fallback...");
          }
        }
      }

      this.status = "error";
      throw new Error(lastError);
    })();

    this.pipelinePromise = promise;
    try {
      await promise;
    } finally {
      this.pipelinePromise = null;
    }
  }

  /**
   * Gera texto usando o modelo local
   */
  private async generateText(prompt: string): Promise<string> {
    // Garante que o pipeline está carregado
    await this.loadPipeline();

    if (!this.pipeline) {
      throw new Error("Pipeline not loaded");
    }

    
    const output = await this.pipeline(prompt, {
      temperature: this.temperature,
      max_length: this.maxTokens,
      num_return_sequences: 1,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return output?.[0]?.generated_text || "";
  }

  /**
   * Parseia tool proposal da saída do modelo
   * Formato esperado: JSON com {name: string, input: string}
   */
  private parseToolProposal(content: string): { name: string; input: string } | null {
    const trimmed = content.trim();
    
    // Tenta parsear JSON direto
    try {
      const parsed = JSON.parse(trimmed) as { tool?: string; name?: string; input?: string };
      const name = parsed.tool || parsed.name;
      const input = parsed.input;
      
      if (name && typeof name === "string" && input && typeof input === "string") {
        return { name, input };
      }
    } catch {
      // Ignora erro de parse
    }

    // Tenta extrair de bloco de código JSON
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim()) as { tool?: string; name?: string; input?: string };
        const name = parsed.tool || parsed.name;
        const input = parsed.input;
        
        if (name && typeof name === "string" && input && typeof input === "string") {
          return { name, input };
        }
      } catch {
        // Ignora erro de parse
      }
    }

    // Tenta extrair objeto JSON inline
    const inlineMatch = trimmed.match(/\{[^}]*"tool"[^}]*\}/);
    if (inlineMatch) {
      try {
        const parsed = JSON.parse(inlineMatch[0]) as { tool?: string; name?: string; input?: string };
        const name = parsed.tool || parsed.name;
        const input = parsed.input;
        
        if (name && typeof name === "string" && input && typeof input === "string") {
          return { name, input };
        }
      } catch {
        // Ignora erro de parse
      }
    }

    return null;
  }

  /**
   * Formata mensagens para o prompt do modelo
   */
  private formatMessages(messages: Array<{ role: string; content: string }>): string {
    const formatted = messages.map((msg) => {
      const roleLabel = msg.role.toUpperCase();
      return `${roleLabel}: ${msg.content}`;
    }).join("\n\n");

    return `${formatted}\n\nAssistant:`;
  }

  /**
   * Chama o modelo com mensagens de contexto
   * Implementa a interface ModelProvider
   */
  async callModel(messages: Array<{ role: string; content: string }>): Promise<{
    ok: boolean;
    output: string;
    toolProposal?: { name: string; input: string } | null;
    evidenceId?: string;
    error?: string;
  }> {
    try {
      // Verifica se estamos no navegador
      if (typeof window === "undefined") {
        return {
          ok: false,
          output: "",
          error: "LocalProvider requires browser environment",
        };
      }

      // Formata mensagens para o prompt
      const prompt = this.formatMessages(messages);

      // Gera texto usando o modelo local
      const output = await this.generateText(prompt);

      // Parseia tool proposal
      const toolProposal = this.parseToolProposal(output);

      // Gera evidence ID (UUID simples)
      const evidenceId = this.generateEvidenceId();

      return {
        ok: true,
        output,
        toolProposal,
        evidenceId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      return {
        ok: false,
        output: "",
        error: errorMessage,
      };
    }
  }

  /**
   * Gera um ID único simples para evidence
   */
  private generateEvidenceId(): string {
    // Gera UUID v4 simples
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Libera recursos do modelo
   */
  async dispose(): Promise<void> {
    if (this.pipeline) {
      try {
        
        await this.pipeline.dispose();
      } catch {
        // Ignora erro ao liberar
      }
      this.pipeline = null;
    }
    this.status = "idle";
    this.loadError = null;
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Cria uma instância do LocalProvider com configuração padrão
 */
export function createLocalProvider(config?: Partial<LocalModelConfig>): LocalProvider {
  return new LocalProvider(config);
}

// ============================================================
// Singleton para uso global
// ============================================================

/** Instância singleton do LocalProvider */
let localProviderInstance: LocalProvider | null = null;

/**
 * Obtém ou cria a instância singleton do LocalProvider
 */
export function getLocalProvider(config?: Partial<LocalModelConfig>): LocalProvider {
  if (!localProviderInstance) {
    localProviderInstance = createLocalProvider(config);
  }
  return localProviderInstance;
}

/**
 * Reseta a instância singleton
 */
export function resetLocalProvider(): void {
  if (localProviderInstance) {
    localProviderInstance.dispose();
    localProviderInstance = null;
  }
}
