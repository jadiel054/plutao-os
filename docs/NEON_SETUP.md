# Neon Setup — Plutão

**Status:** Neon project **exists** (operator). App connection still requires local/Vercel env vars. O schema de hardening de write gates foi conferido no branch principal em 2026-10-07.

## Current Neon (operator-verified)

- Project: Plutao
- Region: São Paulo
- PostgreSQL 17
- Database: `plutao`
- Schema: objetos do baseline e adições foram relatados pelo operador; a presença física de cada tag ainda precisa de inventário read-only versionado.
- Additive: os objetos de `executions`, `missions.idempotency_key` e hardening de `write_gates` foram observados/documentados, mas o journal Drizzle não é prova de aplicação.

## Connection strategy (obrigatório)

| Variable | Type | Use |
|----------|------|-----|
| `DATABASE_URL` | **Pooled** (`-pooler` in host) | App runtime, `/api/health`, serverless |
| `DATABASE_URL_UNPOOLED` | **Direct** (no pooler) | Migrations only (`drizzle-kit`) |

Never run migrations over the pooled connection.

## Wire the application

```bash
cp .env.example .env.local
# Paste pooled URL into DATABASE_URL
# Paste direct URL into DATABASE_URL_UNPOOLED
npm run dev
curl -s http://localhost:3000/api/health
```

## Migrations policy

- **Não executar `drizzle-kit migrate`, SQL ou qualquer migration em produção sem aprovação explícita.** O script agora falha se `DATABASE_URL_UNPOOLED` não estiver definida e nunca cai para a URL pooled.
- Antes de qualquer baseline, executar somente inventário read-only na branch de produção: `to_regclass('drizzle.__drizzle_migrations')`, tabelas/colunas/índices de cada migration e hashes/`folderMillis` do journal versionado. Guardar a saída bruta em artefato revisável.
- Se os objetos comprovarem uma sequência contígua, propor separadamente um baseline do ledger Drizzle: criar a tabela de controle compatível e registrar somente hashes/`created_at` das migrations já comprovadamente refletidas, sem reexecutar os SQL. Nunca registrar apenas `0021` se tags anteriores estiverem sem prova.
- Se houver lacunas, parar e reconciliar em branch Neon/staging; não habilitar migrate automático.
- Somente após revisão e confirmação explícita, aplicar migrations aditivas (`0001`, `0002`, `0021`) com **direct** URL:

```bash
export DATABASE_URL_UNPOOLED="postgresql://...@...neon.tech/plutao?sslmode=require"
npm run migrate -w @plutao/db
```

- `0002_missions_idempotency_key` is required for production atomic idempotency of Pending Intents.
- `0021_hardening_write_gates` is idempotent; it adds `payload_hash`, `consumed_at`, `consumed_by` and `write_gates_status_consumed_idx`. A auditoria anterior observou esses objetos, mas a aplicação e o ledger devem ser confirmados pelo inventário acima.
- Future schema changes go through reviewed SQL + direct URL only.

## Vercel

Add the same env vars in the Vercel project settings (Production + Preview as needed). Prefer pooled URL for `DATABASE_URL`.
