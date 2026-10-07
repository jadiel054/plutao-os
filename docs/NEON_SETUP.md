# Neon Setup — Plutão

**Status:** Neon project **exists** (operator). App connection still requires local/Vercel env vars.

## Current Neon (operator-verified)

- Project: Plutao
- Region: São Paulo
- PostgreSQL 17
- Database: `plutao`
- Schema: baseline 8 tables applied and verified (`0000_baseline.sql`)
- Additive: `executions` (via `0001` / runtime ensure) and `missions.idempotency_key` + unique index (`0002`)
- **`0020_hardening_write_gates.sql` aplicada e verificada em produção (2026-10-07)** —
  `write_gates.payload_hash`, `consumed_at`, `consumed_by` + índice `write_gates_status_consumed_idx`

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

- Baseline is already on Neon — **do not re-run** `0000_baseline.sql` on production.
- Migrations devem ser **aditivas e idempotentes** (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`), para poderem ser aplicadas com segurança sem perder dados.
- **Autorização do operador (2026-10-07):** o operador autorizou explicitamente a aplicação de
  SQL aditivo no Neon de produção diretamente (via MCP `neon.run_sql`), sobrepondo a regra
  anterior de não aplicar SQL. Toda aplicação deve ser registrada em
  `docs/HARDENING_2026-10.md` ou no próprio arquivo da migration.
- Aplicar migrations aditivas com **direct** URL quando aprovado:

```bash
export DATABASE_URL_UNPOOLED="postgresql://...@...neon.tech/plutao?sslmode=require"
npm run migrate -w @plutao/db
```

- `0002_missions_idempotency_key` is required for production atomic idempotency of Pending Intents.
- Future schema changes go through reviewed SQL + direct URL only.

## Vercel

Add the same env vars in the Vercel project settings (Production + Preview as needed). Prefer pooled URL for `DATABASE_URL`.
