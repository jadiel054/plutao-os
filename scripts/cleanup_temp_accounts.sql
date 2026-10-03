-- ============================================================================
-- Cleanup de contas temporárias (guest) — plutao-os
-- ============================================================================
-- Critério UNIFICADO de contas temporárias (2026-10-03):
--   Grupo A (guest): users.is_guest = true
--                     E users.created_at < now() - interval '7 dias'
--                     E nunca convertida (id não aparece em
--                       guest_sessions.converted_user_id)
--   Grupo B (e-mail descartável): users.email LIKE '%@temp.plutao.app'
--                     E users.created_at < now() - interval '7 dias'
--
-- Ordem de deleção derivada de information_schema (table_constraints +
-- referential_constraints), consultada via MCP Neon em 2026-10-03.
-- Regra: filhas antes das mães; users por último.
--
-- Observações do schema real:
--   * A maioria das FKs para users é ON DELETE CASCADE, mas deletamos
--     explicitamente para que o relatório de contagens seja preciso e para
--     não depender de CASCADE implícito.
--   * artifacts e executions têm coluna user_id SEM FK (soft reference) —
--     incluídas explicitamente na cascata.
--   * audit_events.user_id é ON DELETE SET NULL; deletamos explicitamente
--     para remover o vínculo (PII) das contas temporárias.
--   * billing_events, founder_waitlist e magic_link_tokens não possuem
--     coluna user_id e ficam fora da cascata.
--
-- Modo de uso:
--   psql "$DATABASE_URL" -v dry_run=1   # audita e faz ROLLBACK
--   psql "$DATABASE_URL" -v dry_run=0   # aplica de fato
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Alvos: critério unificado (Grupo A OU Grupo B)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _target_users AS
SELECT u.id
FROM users u
WHERE (
        u.is_guest = true
        AND u.created_at < now() - interval '7 days'
        AND NOT EXISTS (
          SELECT 1
          FROM guest_sessions gs
          WHERE gs.converted_user_id = u.id
        )
      )
   OR (
        u.email LIKE '%@temp.plutao.app'
        AND u.created_at < now() - interval '7 days'
      );

CREATE TEMP TABLE _target_conversations AS
SELECT id FROM conversations
WHERE user_id IN (SELECT id FROM _target_users);

CREATE TEMP TABLE _target_missions AS
SELECT id FROM missions
WHERE user_id IN (SELECT id FROM _target_users);

-- ---------------------------------------------------------------------------
-- Auditoria prévia: contagem e amostra dos e-mails afetados
-- ---------------------------------------------------------------------------
SELECT count(*) AS target_user_count FROM _target_users;

SELECT u.id, u.email, u.created_at
FROM users u
JOIN _target_users t ON t.id = u.id
ORDER BY u.created_at
LIMIT 50;

-- ---------------------------------------------------------------------------
-- Deleções — filhas antes das mães, users por último
-- ---------------------------------------------------------------------------

-- Nível 4 (folhas; referenciam conversations / event_artifacts / missions)
DELETE FROM conversation_events
 WHERE conversation_id IN (SELECT id FROM _target_conversations);
DELETE FROM event_artifacts
 WHERE conversation_id IN (SELECT id FROM _target_conversations);
DELETE FROM messages
 WHERE conversation_id IN (SELECT id FROM _target_conversations);
DELETE FROM tasks
 WHERE mission_id IN (SELECT id FROM _target_missions);

-- Nível 3 (referenciam mcp_oauth_grants; write_gates também missions/users)
DELETE FROM mcp_auth_codes
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM write_gates
 WHERE user_id IN (SELECT id FROM _target_users);

-- Soft references (coluna user_id SEM FK no banco)
DELETE FROM executions
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM artifacts
 WHERE user_id IN (SELECT id FROM _target_users);

-- Nível 2 (referenciam users e/ou projects)
DELETE FROM mcp_oauth_grants
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM missions
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM conversations
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM projects
 WHERE user_id IN (SELECT id FROM _target_users);

-- Nível 1 (referenciam users diretamente)
DELETE FROM agents
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM connectors
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM password_reset_tokens
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM sessions
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM usage_counters
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM guest_sessions
 WHERE user_id IN (SELECT id FROM _target_users);
DELETE FROM audit_events
 WHERE user_id IN (SELECT id FROM _target_users);

-- Nível 0: users (por último), com contagem via RETURNING
WITH deleted AS (
  DELETE FROM users
   WHERE id IN (SELECT id FROM _target_users)
  RETURNING id
)
SELECT count(*) AS deleted_users FROM deleted;

-- ---------------------------------------------------------------------------
-- Dry-run: descarta tudo; caso contrário, efetiva
-- ---------------------------------------------------------------------------
\if :dry_run
\echo 'DRY RUN: nenhuma deleção foi efetivada (ROLLBACK).'
ROLLBACK;
\else
COMMIT;
\endif
