-- H1 — Write gate à prova de bypass.
--
-- Antes: o executor aceitava o booleano `_gateApproved` vindo do input, sem
-- validar que existia um gate real aprovado por humano. Qualquer payload com
-- `_gateApproved: true` executava a escrita.
--
-- Depois: a escrita só executa com `_gateId` apontando para um gate do próprio
-- usuário, com status `approved`, cujo `payload_hash` bate com o payload
-- normalizado que será executado. O consumo é atômico (single-use).
--
-- Aditiva e idempotente: não altera nem remove dados existentes.

ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "payload_hash" text;
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "consumed_at" timestamp with time zone;
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "consumed_by" text;

CREATE INDEX IF NOT EXISTS "write_gates_status_consumed_idx"
  ON "write_gates" ("status", "consumed_at");

-- Gates criados ANTES desta migration ficam com payload_hash NULL. Eles não são
-- expirados nem alterados: no momento da aprovação o servidor calcula o hash a
-- partir do `payload` já persistido (o mesmo que o humano viu na tela) e o grava.
-- Assim nenhum gate pendente real é perdido e a validação continua server-side.
