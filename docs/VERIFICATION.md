# Verification checklist — Phase 1 Foundation

Foundation moves from **IMPLEMENTED** → **VERIFIED** only when all items below have real evidence (command output or CI green).

## A. Install & lockfile

- [ ] `npm install` completes on a stable machine
- [ ] Root `package-lock.json` exists and is committed to GitHub
- [ ] Workspaces resolve: `apps/web`, `packages/domain`, `packages/db`

## B. Build

- [ ] `npm run build` (or `npm run build -w apps/web`) exits 0
- [ ] No TypeScript errors in app or packages used by the app
- [ ] Output includes static routes `/` and `/api/health` (or equivalent)

## C. Neon connection

- [ ] `.env.local` has pooled `DATABASE_URL` (not committed)
- [ ] `GET /api/health` returns `"database": { "ok": true, "latencyMs": <n> }`
- [ ] In production mode, failed DB check does **not** leak raw error strings

## D. Schema alignment (manual / already done)

- [x] Neon has 8 tables matching baseline (operator verified 2026-09-09)
- [x] `0000_baseline.sql` versioned in Git
- [x] No migrate/stamp run against live Neon without approval

## E. Not required for Foundation VERIFIED

- Auth flows
- Mission Engine
- Drizzle migrator stamp table
- Vercel production deploy (recommended next, not blocking VERIFIED if local A–C pass)

## Evidence format

Paste or attach:

1. `npm install` last lines (`added N packages`)
2. `npm run build` summary
3. `curl -s localhost:3000/api/health` JSON
