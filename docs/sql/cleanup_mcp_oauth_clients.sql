-- Manutenção manual de clientes OAuth registrados dinamicamente sem grants.
-- Pré-visualize candidatos antes de executar o DELETE:
-- SELECT c.client_id, c.client_name, c.created_at
-- FROM mcp_oauth_clients AS c
-- WHERE c.created_at < now() - interval '30 days'
--   AND NOT EXISTS (
--     SELECT 1 FROM mcp_oauth_grants AS g WHERE g.client_id = c.client_id
--   )
-- ORDER BY c.created_at;
--
-- Execute somente após revisar a pré-visualização. Clientes apagados precisarão
-- ser registrados novamente pelo cliente MCP.
BEGIN;
DELETE FROM mcp_oauth_clients AS c
WHERE c.created_at < now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM mcp_oauth_grants AS g WHERE g.client_id = c.client_id
  )
RETURNING c.client_id, c.client_name, c.created_at;

-- Limpa os buckets de rate limit antigos junto com a manutenção mensal.
DELETE FROM mcp_oauth_registration_limits
WHERE window_start < now() - interval '30 days';
COMMIT;
