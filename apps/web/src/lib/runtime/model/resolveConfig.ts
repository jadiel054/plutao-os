/**
 * Resolve catálogo PRESET_MODELS.id → endpoint real de API.
 * O id do catálogo NÃO é o nome do modelo na API.
 */

import { PRESET_MODELS } from "@plutao/domain";
import type { ModelConfig, ModelProviderId } from "./types";

export type CloudRoute = {
  /** Provedor lógico no runtime Plutão */
  provider: ModelProviderId;
  /** Nome do modelo aceito pela API do provedor */
  apiModel: string;
  /** Base URL OpenAI-compatible (ou Gemini OpenAI-compat) */
  baseUrl: string;
  /** Variável de ambiente preferida para a chave */
  envKeys: string[];
};

export type ResolveCloudResult =
  | { ok: true; config: ModelConfig; route: CloudRoute }
  | { ok: false; error: string; missingEnv?: string; route?: CloudRoute };

/**
 * Tabela explícita: id do catálogo → rota de API.
 * Modelos locais (Xenova/…) não entram aqui.
 */
const CLOUD_ROUTES: Record<string, CloudRoute> = {
  // Groq
  "groq/llama-3.3-70b-versatile": {
    provider: "openai",
    apiModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    envKeys: ["GROQ_API_KEY", "MODEL_API_KEY"],
  },
  "groq/deepseek-r1-distill-llama-70b": {
    provider: "openai",
    apiModel: "deepseek-r1-distill-llama-70b",
    baseUrl: "https://api.groq.com/openai/v1",
    envKeys: ["GROQ_API_KEY", "MODEL_API_KEY"],
  },
  "groq/gpt-oss-120b": {
    provider: "openai",
    apiModel: "openai/gpt-oss-120b",
    baseUrl: "https://api.groq.com/openai/v1",
    envKeys: ["GROQ_API_KEY", "MODEL_API_KEY"],
  },

  // OpenAI
  "openai/gpt-4o-mini": {
    provider: "openai",
    apiModel: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    envKeys: ["OPENAI_API_KEY", "MODEL_API_KEY"],
  },
  "openai/gpt-4o": {
    provider: "openai",
    apiModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    envKeys: ["OPENAI_API_KEY", "MODEL_API_KEY"],
  },

  // Google Gemini (endpoint OpenAI-compatible)
  "gemini/gemini-3.1-flash-lite": {
    provider: "gemini",
    apiModel: "gemini-3.1-flash-lite",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKeys: ["GEMINI_API_KEY"],
  },
  "gemini/gemini-3.1-pro": {
    provider: "gemini",
    apiModel: "gemini-3.1-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKeys: ["GEMINI_API_KEY"],
  },

  // Anthropic via OpenRouter (API OpenAI-compatible)
  "anthropic/claude-sonnet-4.5": {
    provider: "openai",
    apiModel: "anthropic/claude-sonnet-4.5",
    baseUrl: "https://openrouter.ai/api/v1",
    envKeys: ["OPENROUTER_API_KEY", "MODEL_API_KEY"],
  },

  // xAI Grok (aliases úteis se entrarem no catálogo)
  "xai/grok-4.6": {
    provider: "xai",
    apiModel: "grok-4.6",
    baseUrl: "https://api.x.ai/v1",
    envKeys: ["XAI_API_KEY", "MODEL_API_KEY"],
  },
  "xai/grok-4.3": {
    provider: "xai",
    apiModel: "grok-4.3",
    baseUrl: "https://api.x.ai/v1",
    envKeys: ["XAI_API_KEY", "MODEL_API_KEY"],
  },
  "xai/grok-2-latest": {
    provider: "xai",
    apiModel: "grok-4.6",
    baseUrl: "https://api.x.ai/v1",
    envKeys: ["XAI_API_KEY", "MODEL_API_KEY"],
  },
};

function firstEnv(keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return null;
}

/** Inferência a partir do prefixo do id quando não há rota explícita. */
function inferRoute(modelId: string): CloudRoute | null {
  if (modelId.startsWith("Xenova/") || modelId.includes("local")) return null;

  if (modelId.startsWith("groq/")) {
    return {
      provider: "openai",
      apiModel: modelId.slice("groq/".length),
      baseUrl: "https://api.groq.com/openai/v1",
      envKeys: ["GROQ_API_KEY", "MODEL_API_KEY"],
    };
  }
  if (modelId.startsWith("openai/")) {
    return {
      provider: "openai",
      apiModel: modelId.slice("openai/".length),
      baseUrl: "https://api.openai.com/v1",
      envKeys: ["OPENAI_API_KEY", "MODEL_API_KEY"],
    };
  }
  if (modelId.startsWith("gemini/")) {
    return {
      provider: "gemini",
      apiModel: modelId.slice("gemini/".length),
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      envKeys: ["GEMINI_API_KEY"],
    };
  }
  if (modelId.startsWith("anthropic/")) {
    return {
      provider: "openai",
      apiModel: modelId,
      baseUrl: "https://openrouter.ai/api/v1",
      envKeys: ["OPENROUTER_API_KEY", "MODEL_API_KEY"],
    };
  }
  if (modelId.startsWith("xai/") || modelId.startsWith("grok-")) {
    return {
      provider: "xai",
      apiModel: modelId.startsWith("xai/") ? modelId.slice("xai/".length) : modelId,
      baseUrl: "https://api.x.ai/v1",
      envKeys: ["XAI_API_KEY", "MODEL_API_KEY"],
    };
  }
  return null;
}

export function getCloudRoute(modelId: string): CloudRoute | null {
  if (!modelId) return null;
  return CLOUD_ROUTES[modelId] ?? inferRoute(modelId);
}

export function isLocalCatalogModel(modelId: string): boolean {
  const preset = PRESET_MODELS.find((m) => m.id === modelId);
  if (preset?.providerType === "local") return true;
  return modelId.startsWith("Xenova/");
}

/**
 * Resolve um id de catálogo (ou id livre) para ModelConfig pronto para chatCompletion.
 */
export function resolveCloudModelConfig(modelId: string): ResolveCloudResult {
  if (isLocalCatalogModel(modelId)) {
    return {
      ok: false,
      error: `O modelo "${modelId}" é local (navegador). Use o modo offline/WebGPU no cliente — não há chamada de nuvem.`,
    };
  }

  const route = getCloudRoute(modelId);
  if (!route) {
    return {
      ok: false,
      error: `Modelo "${modelId}" sem rota de API conhecida. Verifique o catálogo ou MODEL_NAME.`,
    };
  }

  // Permitir override de base URL global só quando a rota usa MODEL_API_KEY genérica
  // e MODEL_BASE_URL está definido (compat com setup antigo).
  let baseUrl = route.baseUrl;
  const globalBase = process.env.MODEL_BASE_URL?.trim();
  if (globalBase && route.envKeys.includes("MODEL_API_KEY")) {
    // Só sobrescreve se a chave efetiva vier de MODEL_API_KEY e o provedor for o default do env
    const keyFromModel = process.env.MODEL_API_KEY?.trim();
    const keyFromSpecific = route.envKeys
      .filter((k) => k !== "MODEL_API_KEY")
      .map((k) => process.env[k]?.trim())
      .find(Boolean);
    if (keyFromModel && !keyFromSpecific) {
      baseUrl = globalBase;
    }
  }

  const apiKey = firstEnv(route.envKeys);
  if (!apiKey) {
    return {
      ok: false,
      error: `Chave ausente para ${modelId}. Configure uma de: ${route.envKeys.join(", ")}.`,
      missingEnv: route.envKeys[0],
      route,
    };
  }

  return {
    ok: true,
    route,
    config: {
      provider: route.provider,
      apiKey,
      model: route.apiModel,
      baseUrl,
    },
  };
}
