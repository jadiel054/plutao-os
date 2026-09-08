# Neon Setup — Plutão

**Status:** PREPARED (manual steps; Neon connector not connected in this environment)

## Why Neon

Serverless Postgres, branching, scale-to-zero. Aligns with Phase 1 (PostgreSQL + Drizzle).

## Connection strategy (obrigatório)

| Variable | Type | Use |
|----------|------|-----|
| `DATABASE_URL` | **Pooled** (`-pooler` no host) | App runtime, serverless |
| `DATABASE_URL_UNPOOLED` | **Direct** (sem pooler) | Migrations, `drizzle-kit`, `pg_dump` |

Nunca rode migrations na connection pooled.

## Passos manuais (console Neon)

1. Acesse https://console.neon.tech e crie um projeto (ex.: `plutao-os`).
2. Região: a mais próxima de você / da Vercel.
3. Database name: `neondb` (default) ou `plutao`.
4. Copie as duas connection strings:
   - **Pooled** → `DATABASE_URL`
   - **Direct** → `DATABASE_URL_UNPOOLED`
5. Localmente:
   ```bash
   cp .env.example .env.local
   # preencha DATABASE_URL e DATABASE_URL_UNPOOLED
   ```
6. Quando for aplicar migrations (ainda **não** nesta etapa):
   ```bash
   cd packages/db
   npm install   # adiciona packages/db de volta ao workspace se necessário
   export DATABASE_URL_UNPOOLED="..."
   npx drizzle-kit generate
   npx drizzle-kit migrate
   ```

## CLI opcional (`neonctl`)

```bash
npm i -g neonctl
neonctl auth
neonctl projects create --name plutao-os
neonctl connection-string --project-id <id> --pooled
neonctl connection-string --project-id <id>   # direct
```

## O que ainda NÃO fazer

- Não aplicar migrations até `next build` estar verificado em ambiente estável.
- Não commitar `.env` / `.env.local` com secrets.

## Estado no repo

- Schema Drizzle: `packages/db/src/schema.ts` (IMPLEMENTED)
- `drizzle.config.ts` já usa `DATABASE_URL_UNPOOLED` preferencialmente
- Migrations: NOT STARTED
