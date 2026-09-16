# Neon Setup — Plutão

**Status:** Neon project **exists** (operator). App connection still requires local/Vercel env vars.

## Current Neon (operator-verified)

- Project: Plutao
- Region: São Paulo
- PostgreSQL 17
- Database: `plutao`
- Schema: baseline 8 tables applied and verified (`0000_baseline.sql`)
- Additive: `executions` (via `0001` / runtime ensure) and `missions.idempotency_key` + unique index (`0002` — apply with migrate if not yet present)

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
- Apply additive migrations (`0001`, `0002`) with **direct** URL only when approved:

```bash
export DATABASE_URL_UNPOOLED="postgresql://...@...neon.tech/plutao?sslmode=require"
npm run migrate -w @plutao/db
```

- `0002_missions_idempotency_key` is required for production atomic idempotency of Pending Intents.
- Future schema changes go through reviewed SQL + direct URL only.

## Vercel

Add the same env vars in the Vercel project settings (Production + Preview as needed). Prefer pooled URL for `DATABASE_URL`.
