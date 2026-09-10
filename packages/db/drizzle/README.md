# Migrations — @plutao/db

## Baseline (`0000_baseline`)

Reflects the Neon database **plutao** as of 2026-09-09:

- 8 tables: users, sessions, password_reset_tokens, projects, agents, missions, tasks, audit_events
- Already applied and verified on Neon (operator)
- SQL uses `IF NOT EXISTS` / exception handlers — non-destructive if re-run by mistake

## Operator procedure (existing Neon)

Do **not** run `drizzle-kit migrate` against the live Neon that already has the schema unless you have stamped the baseline.

Future schema changes: edit `src/schema.ts` → `npm run generate` in packages/db → review SQL → migrate with **direct** URL (`DATABASE_URL_UNPOOLED`).

Never run migrations over the pooled connection.
