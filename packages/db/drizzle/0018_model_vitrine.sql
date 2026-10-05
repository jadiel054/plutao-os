-- Migration 0018: Vitrine de modelos curados + aceite explícito de risco.
-- Aplicar manualmente no Neon. Esta migration não é executada pelo agente.

CREATE TABLE IF NOT EXISTS model_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  author text NOT NULL,
  license text,
  approx_size_bytes bigint NOT NULL,
  pipeline_tag text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text NOT NULL,
  download_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_catalog_pipeline_idx
  ON model_catalog (pipeline_tag);

CREATE TABLE IF NOT EXISTS risk_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_ref text NOT NULL,
  reason_shown text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_acceptances_user_id_idx
  ON risk_acceptances (user_id);
CREATE INDEX IF NOT EXISTS risk_acceptances_model_ref_idx
  ON risk_acceptances (model_ref);

INSERT INTO model_catalog
  (id, name, author, license, approx_size_bytes, pipeline_tag, tags, source_url, download_url)
VALUES
  (
    'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    'Qwen2.5 1.5B Instruct Q4_K_M',
    'Qwen',
    'Apache-2.0',
    1100000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true'
  ),
  (
    'Qwen/Qwen2.5-3B-Instruct-GGUF',
    'Qwen2.5 3B Instruct Q4_K_M',
    'Qwen',
    'Apache-2.0',
    2300000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF',
    'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf?download=true'
  ),
  (
    'Qwen/Qwen2.5-7B-Instruct-GGUF',
    'Qwen2.5 7B Instruct Q4_K_M',
    'Qwen',
    'Apache-2.0',
    4700000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF',
    'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf?download=true'
  ),
  (
    'bartowski/Llama-3.2-1B-Instruct-GGUF',
    'Llama 3.2 1B Instruct Q4_K_M',
    'Meta',
    'Llama 3.2 Community',
    900000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF',
    'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true'
  ),
  (
    'bartowski/Llama-3.2-3B-Instruct-GGUF',
    'Llama 3.2 3B Instruct Q4_K_M',
    'Meta',
    'Llama 3.2 Community',
    2100000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
    'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true'
  ),
  (
    'bartowski/Phi-3.5-mini-instruct-GGUF',
    'Phi-3.5 Mini Instruct Q4_K_M',
    'Microsoft',
    'MIT',
    2400000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF',
    'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true'
  ),
  (
    'bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    'Mistral 7B Instruct v0.3 Q4_K_M',
    'Mistral AI',
    'Apache-2.0',
    4700000000,
    'text-generation',
    '["gguf", "q4_k_m", "text-generation"]'::jsonb,
    'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf?download=true'
  )
ON CONFLICT (id) DO NOTHING;
