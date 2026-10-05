export type CuratedModel = {
  id: string;
  name: string;
  author: string;
  license: string;
  approxSizeBytes: number;
  pipelineTag: string;
  tags: string[];
  sourceUrl: string;
  downloadUrl: string | null;
  curated: true;
};

export const CURATED_MODEL_CATALOG: CuratedModel[] = [
  {
    id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    name: "Qwen2.5 1.5B Instruct Q4_K_M",
    author: "Qwen",
    license: "Apache-2.0",
    approxSizeBytes: 1_100_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true",
    curated: true,
  },
  {
    id: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    name: "Qwen2.5 3B Instruct Q4_K_M",
    author: "Qwen",
    license: "Apache-2.0",
    approxSizeBytes: 2_300_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf?download=true",
    curated: true,
  },
  {
    id: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    name: "Qwen2.5 7B Instruct Q4_K_M",
    author: "Qwen",
    license: "Apache-2.0",
    approxSizeBytes: 4_700_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf?download=true",
    curated: true,
  },
  {
    id: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    name: "Llama 3.2 1B Instruct Q4_K_M",
    author: "Meta",
    license: "Llama 3.2 Community",
    approxSizeBytes: 900_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true",
    curated: true,
  },
  {
    id: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    name: "Llama 3.2 3B Instruct Q4_K_M",
    author: "Meta",
    license: "Llama 3.2 Community",
    approxSizeBytes: 2_100_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true",
    curated: true,
  },
  {
    id: "bartowski/Phi-3.5-mini-instruct-GGUF",
    name: "Phi-3.5 Mini Instruct Q4_K_M",
    author: "Microsoft",
    license: "MIT",
    approxSizeBytes: 2_400_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF",
    downloadUrl: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true",
    curated: true,
  },
  {
    id: "bartowski/Mistral-7B-Instruct-v0.3-GGUF",
    name: "Mistral 7B Instruct v0.3 Q4_K_M",
    author: "Mistral AI",
    license: "Apache-2.0",
    approxSizeBytes: 4_700_000_000,
    pipelineTag: "text-generation",
    tags: ["gguf", "q4_k_m", "text-generation"],
    sourceUrl: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF",
    downloadUrl: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf?download=true",
    curated: true,
  },
];

export function filterCuratedModels(query: string): CuratedModel[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return CURATED_MODEL_CATALOG;
  return CURATED_MODEL_CATALOG.filter((model) =>
    [model.id, model.name, model.author].some((value) => value.toLocaleLowerCase().includes(needle))
  );
}
