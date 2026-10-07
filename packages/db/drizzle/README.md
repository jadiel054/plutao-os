# Migrations — @plutao/db

## Baseline (`0000_baseline`)

Reflects the Neon database **plutao** as of 2026-09-09:

- 8 tables: users, sessions, password_reset_tokens, projects, agents, missions, tasks, audit_events
- Already applied and verified on Neon (operator)
- SQL uses `IF NOT EXISTS` / exception handlers — non-destructive if re-run by mistake

## Additive migrations

| Tag | Purpose | Notes |
|-----|---------|-------|
| `0001_executions` | Durable Runtime `executions` table + indexes | Also bootstrapped at runtime by `ensureExecutionsTable()` for deploys that predate migrate |
| `0002_missions_idempotency_key` | Column `missions.idempotency_key` + UNIQUE `(user_id, idempotency_key)` | Required for atomic Pending Intent idempotency. Safe (`IF NOT EXISTS`). **Apply on production Neon with direct URL.** |
| `0003_artifacts` | Artifacts table | Mission/workspace files metadata |
| `0004_connectors` | MCP/OAuth `connectors` table | Tokens encrypted at app layer. **Required before GitHub OAuth works.** See `docs/CONECTORES_M5.md`. |

Journal: `meta/_journal.json` lists all applied and pending migration tags.

| `0020_mcp_oauth_clients` | OAuth 2.0 Dynamic Client Registration for MCP (RFC 7591) | Apply before deploying the dynamic registration endpoint. Existing manually configured client IDs remain supported. |

## Operator procedure (existing Neon)

1. Use **direct** connection only: `DATABASE_URL_UNPOOLED` (never pooled for migrate).
2. From repo root:

```bash
export DATABASE_URL_UNPOOLED="postgresql://...@...neon.tech/plutao?sslmode=require"
npm run migrate -w @plutao/db
```

3. Do **not** re-run `0000_baseline.sql` on production.
4. Future schema changes: edit `src/schema.ts` → `npm run generate -w @plutao/db` → review SQL → migrate with direct URL.

Never run migrations over the pooled connection.
