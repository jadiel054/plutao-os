# Development — Plutão

## Prerequisites

- Node.js ≥ 20
- npm (workspaces)
- Neon project with database `plutao` (schema already applied)

## Clone and install

```bash
git clone git@github.com:jadiel054/plutao-os.git
cd plutao-os
npm install
```

This should produce a root `package-lock.json`. Commit it when first generated on a stable machine.

## Environment

```bash
cp .env.example .env.local
```

Fill:

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Neon **pooled** connection string |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` (Auth phase) |

Never commit `.env.local`.

## Run

```bash
npm run dev          # apps/web on http://localhost:3000
curl -s http://localhost:3000/api/health
```

Expected with valid `DATABASE_URL`:

```json
{ "ok": true, "service": "plutao-web", "database": { "ok": true, "latencyMs": 12 } }
```

Without `DATABASE_URL`, health returns `200` with `database.skipped: true`.

## Build

```bash
npm run build
```

## Workspace packages

| Package | Role |
|---------|------|
| `apps/web` | Next.js 15 PWA cockpit |
| `packages/domain` | Shared TypeScript types |
| `packages/db` | Drizzle schema, Neon client, migrations |

`apps/web` depends on `@plutao/db`. Next config uses `transpilePackages`.

## Migrations (do not run casually against live Neon)

- Baseline `packages/db/drizzle/0000_baseline.sql` **already matches** production Neon.
- Do **not** run `drizzle-kit migrate` on the existing Neon without explicit approval.
- Future changes: edit `schema.ts` → `npm run generate -w @plutao/db` → review SQL → migrate with **direct** URL only.

## Sandbox note

Some agent/sandbox environments fail `npm install` with filesystem EIO. Prefer local machine or GitHub Actions for verification evidence.
