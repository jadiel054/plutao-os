-- Migration 0020: registro dinâmico de clientes OAuth para MCP (RFC 7591).
-- Aplicar manualmente no Neon antes de implantar o endpoint de registro.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_name text,
  redirect_uris text[] NOT NULL,
  grant_types text[] NOT NULL,
  response_types text[] NOT NULL,
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_clients_created_at_idx
  ON mcp_oauth_clients (created_at);
