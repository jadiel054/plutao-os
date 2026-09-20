-- Script SQL Idempotente para suporte futuro a metadata de edição em mensagens se persistidas em tabela Postgres
-- O operador aplica manualmente no Neon/Postgres se e quando desejado. NÃO aplique em tempo de execução de aplicação.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'chat_messages' AND column_name = 'edited_at'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN edited_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;
