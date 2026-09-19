/**
 * Model Registry & Types — Definições e catálogo de modelos de IA (Nuvem e Local Browser)
 */

export type ModelProviderType = "cloud" | "local";
export type ModelCategory = "text" | "code" | "vision" | "lightweight";
export type HardwareRequirement = "webgpu" | "cpu" | "cloud";
export type ModelStatusState = "available" | "downloading" | "downloaded" | "active" | "error";

export interface AIModel {
  id: string;
  name: string;
  providerType: ModelProviderType;
  providerName: string;
  category: ModelCategory;
  description: string;
  parameters: string;
  sizeBytes: number;
  sizeLabel: string;
  hardware: HardwareRequirement;
  speedRating: number; // 1 to 5
  license: string;
  isRecommended?: boolean;
  hfRepo?: string;
  quantization?: string;
}

export interface ModelDownloadProgress {
  modelId: string;
  status: "idle" | "downloading" | "paused" | "downloaded" | "error";
  progress: number; // 0 to 100
  loadedBytes: number;
  totalBytes: number;
  speedMBs: number;
  error?: string;
}

export interface ModelFilterOptions {
  search: string;
  provider: "all" | "cloud" | "local";
  category: "all" | ModelCategory;
  status: "all" | "downloaded" | "available";
  sortBy: "name" | "size" | "speed" | "parameters";
}

export const PRESET_MODELS: AIModel[] = [
  {
    id: "Xenova/Llama-3.2-3B-Instruct-q4",
    name: "Llama 3.2 3B Instruct (q4)",
    providerType: "local",
    providerName: "Hugging Face / WebGPU",
    category: "text",
    description: "Modelo compacto oficial Meta otimizado para navegadores com WebGPU. Excelente capacidade de raciocínio local.",
    parameters: "3.2B",
    sizeBytes: 1950000000,
    sizeLabel: "1.95 GB",
    hardware: "webgpu",
    speedRating: 4,
    license: "Llama 3.2 Community",
    isRecommended: true,
    hfRepo: "Xenova/Llama-3.2-3B-Instruct-q4",
    quantization: "Q4_K_M",
  },
  {
    id: "Xenova/Phi-3-mini-4k-instruct-q4",
    name: "Phi-3 Mini 4K Instruct (q4)",
    providerType: "local",
    providerName: "Hugging Face / WebGPU",
    category: "lightweight",
    description: "Modelo ultraleve da Microsoft para execução em CPU/WebGPU com baixo consumo de memória.",
    parameters: "3.8B",
    sizeBytes: 2300000000,
    sizeLabel: "2.30 GB",
    hardware: "webgpu",
    speedRating: 5,
    license: "MIT",
    hfRepo: "Xenova/Phi-3-mini-4k-instruct-q4",
    quantization: "Q4_0",
  },
  {
    id: "Xenova/Qwen2.5-1.5B-Instruct",
    name: "Qwen 2.5 1.5B Instruct",
    providerType: "local",
    providerName: "Hugging Face / WebGPU",
    category: "code",
    description: "Modelo de alta eficiência da Alibaba Cloud focado em tarefas de código, lógica e múltiplos idiomas.",
    parameters: "1.5B",
    sizeBytes: 980000000,
    sizeLabel: "980 MB",
    hardware: "webgpu",
    speedRating: 5,
    license: "Apache-2.0",
    isRecommended: true,
    hfRepo: "Xenova/Qwen2.5-1.5B-Instruct",
    quantization: "Q4_K_M",
  },
  {
    id: "Xenova/all-MiniLM-L6-v2",
    name: "MiniLM L6 v2 (Embeddings)",
    providerType: "local",
    providerName: "Hugging Face / Transformers.js",
    category: "lightweight",
    description: "Modelo rápido para geração de embeddings vetoriais e busca semântica em memórias locais.",
    parameters: "22M",
    sizeBytes: 90000000,
    sizeLabel: "90 MB",
    hardware: "cpu",
    speedRating: 5,
    license: "Apache-2.0",
    hfRepo: "Xenova/all-MiniLM-L6-v2",
    quantization: "ONNX FP32",
  },
  {
    id: "groq/llama-3.3-70b-versatile",
    name: "Llama 3.3 70B Versatile",
    providerType: "cloud",
    providerName: "Groq Cloud API",
    category: "text",
    description: "Modelo carro-chefe da Meta executado na infraestrutura ultra-rápida LPU da Groq em nuvem.",
    parameters: "70B",
    sizeBytes: 0,
    sizeLabel: "Nuvem",
    hardware: "cloud",
    speedRating: 5,
    license: "API Provedor",
    isRecommended: true,
  },
  {
    id: "groq/deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 Distill Llama 70B",
    providerType: "cloud",
    providerName: "Groq Cloud API",
    category: "code",
    description: "Modelo especialista em raciocínio matemático avançado e geração de código de alta complexidade.",
    parameters: "70B",
    sizeBytes: 0,
    sizeLabel: "Nuvem",
    hardware: "cloud",
    speedRating: 5,
    license: "API Provedor",
  },
  {
    id: "groq/gpt-oss-120b",
    name: "GPT-OSS 120B Agent",
    providerType: "cloud",
    providerName: "Groq Cloud API",
    category: "text",
    description: "Provedor padrão em nuvem para execução autônoma do agente Plutão com suporte a tool call.",
    parameters: "120B",
    sizeBytes: 0,
    sizeLabel: "Nuvem",
    hardware: "cloud",
    speedRating: 5,
    license: "API Provedor",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini (Multimodal)",
    providerType: "cloud",
    providerName: "OpenAI / OpenRouter",
    category: "vision",
    description: "Modelo multimodal rápido com suporte a análise de imagens, OCR e visão computacional.",
    parameters: "N/A",
    sizeBytes: 0,
    sizeLabel: "Nuvem",
    hardware: "cloud",
    speedRating: 4,
    license: "API Provedor",
  },
  {
    id: "gemini/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    providerType: "cloud",
    providerName: "Google AI Studio",
    category: "vision",
    description: "Modelo multimodal nativo ultra-rápido para imagens, PDFs e grandes contextos.",
    parameters: "N/A",
    sizeBytes: 0,
    sizeLabel: "Nuvem",
    hardware: "cloud",
    speedRating: 5,
    license: "API Provedor",
    isRecommended: true,
  },
];

/**
 * Filtra a lista de modelos segundo as opções fornecidas
 */
export function filterModels(models: AIModel[], options: ModelFilterOptions, downloadedIds: string[] = []): AIModel[] {
  return models.filter((m) => {
    // Search term
    if (options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      const matchName = m.name.toLowerCase().includes(q);
      const matchDesc = m.description.toLowerCase().includes(q);
      const matchId = m.id.toLowerCase().includes(q);
      const matchRepo = m.hfRepo?.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchId && !matchRepo) return false;
    }

    // Provider filter
    if (options.provider !== "all" && m.providerType !== options.provider) {
      return false;
    }

    // Category filter
    if (options.category !== "all" && m.category !== options.category) {
      return false;
    }

    // Status filter
    if (options.status !== "all") {
      const isDownloaded = m.providerType === "cloud" || downloadedIds.includes(m.id);
      if (options.status === "downloaded" && !isDownloaded) return false;
      if (options.status === "available" && isDownloaded && m.providerType === "local") return false;
    }

    return true;
  }).sort((a, b) => {
    if (options.sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (options.sortBy === "size") {
      return b.sizeBytes - a.sizeBytes;
    }
    if (options.sortBy === "speed") {
      return b.speedRating - a.speedRating;
    }
    if (options.sortBy === "parameters") {
      return a.parameters.localeCompare(b.parameters);
    }
    return 0;
  });
}
