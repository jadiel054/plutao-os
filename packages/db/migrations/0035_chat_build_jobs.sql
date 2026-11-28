-- 0035_chat_build_jobs.sql
-- Execução durável da criação de sistemas no Chat (kind="chat_build").
-- Aplicação MANUAL no Neon pelo mantenedor (padrão do projeto).
--
-- runtime_jobs passa a aceitar jobs SEM missão e SEM execution do Cockpit:
-- a criação no Chat é durável, mas NÃO é uma missão (separação de produto).

ALTER TABLE runtime_jobs ALTER COLUMN mission_id DROP NOT NULL;
ALTER TABLE runtime_jobs ALTER COLUMN execution_id DROP NOT NULL;

-- Idempotência: no máximo um build ativo por usuário+conversa.
CREATE UNIQUE INDEX IF NOT EXISTS runtime_jobs_chat_build_active_uidx
  ON runtime_jobs (user_id, (payload->>'conversationId'))
  WHERE kind = 'chat_build'
    AND status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL')
    AND payload->>'conversationId' IS NOT NULL;