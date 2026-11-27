-- Migration 0034: idempotência ATÔMICA de mensagens locais (chat offline).
-- Aplicar no SQL Editor do Neon (padrão da casa — não migrate automático em prod),
-- igual às migrations 0032/0033.
--
-- Garante, a nível de banco, que o mesmo clientMessageId não produza duas
-- linhas de mesma role na mesma conversa — elimina a corrida do dedupe por
-- janela (consultar-antes-de-inserir).

CREATE UNIQUE INDEX IF NOT EXISTS "messages_local_client_msg_uidx"
  ON "messages" ("conversation_id", "role", ("metadata"->>'clientMessageId'))
  WHERE "metadata"->>'clientMessageId' IS NOT NULL;
