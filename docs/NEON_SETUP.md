# Neon Setup — Plutão

**Status:** Neon project **exists** (operator). App connection still requires local/Vercel env vars.

## Current Neon (operator-verified)

- Project: Plutao
- Region: São Paulo
- PostgreSQL 17
- Database: `plutao`
- Schema: 8 tables applied and verified (matches `packages/db/drizzle/0000_baseline.sql`)

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
- Do not run `drizzle-kit migrate` against this Neon without explicit approval.
- Future schema changes go through reviewed SQL + direct URL only.

## Vercel

Add the same env vars in the Vercel project settings (Production + Preview as needed). Prefer pooled URL for `DATABASE_URL`.
