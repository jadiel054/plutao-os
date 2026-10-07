# Deployment prep — Vercel (not deployed yet)

## Recommended project settings

| Setting | Value | Why |
|---------|--------|-----|
| **Root Directory** | repository root (`.`) | npm workspaces live at root; `@plutao/db` must resolve |
| **Install Command** | `npm install` (default) | installs all workspaces |
| **Build Command** | `npm run build -w apps/web` or `npm run build` | root script targets apps/web |
| **Output Directory** | leave default (Next detects) | Next.js app under apps/web via workspace |
| **Node.js** | 20.x | matches `engines` and CI |

If Vercel UI forces Root Directory = `apps/web`, install will **not** see workspace packages unless you set:

```text
Install Command: cd ../.. && npm install
Build Command: cd ../.. && npm run build -w apps/web
```

Prefer Root Directory = monorepo root.

## Environment variables (Vercel)

| Name | Required for first deploy | Notes |
|------|---------------------------|--------|
| `DATABASE_URL` | for health DB check | Neon **pooled**; server-only |
| `DATABASE_URL_UNPOOLED` | no (runtime) | only if running migrations from CI later |
| `AUTH_SECRET` | no until Auth | placeholder |
| `CRON_SECRET` | yes for durable worker | secret used by `/api/cron/runtime-worker`; Vercel Cron sends it as Bearer authorization |

Do not expose database URLs to the client.

## What is already deploy-oriented in code

- Next.js App Router in `apps/web`
- `transpilePackages: ["@plutao/db", "@plutao/domain"]`
- `/api/health` does not require DB at build time
- PWA `public/sw.js` + register component
- CI workflow mirrors install + build
- `apps/web/vercel.json` schedules `/api/cron/runtime-worker` every minute and the write-gate cleanup daily

## Durable runtime worker (mission execution)

O endpoint `POST /api/missions/:id/autonomous-run` **somente enfileira** uma execution `PENDING` e retorna `202`. O processamento acontece em `POST /api/cron/runtime-worker`, protegido por `Authorization: Bearer $CRON_SECRET`.

Em produção:

1. Defina `CRON_SECRET` no ambiente da Vercel.
2. Confirme que as migrations `0024_autonomous_platform_foundation.sql`, `0025_mission_intake.sql` e `0026_mission_graph_v2.sql` foram aplicadas no Neon, em ordem.
3. Execute uma missão de teste com pelo menos dois nós dependentes e confirme que o mesmo job passa por continuations serializadas até `runtime_jobs.SUCCEEDED` e `executions.COMPLETED`.
4. Confirme que uma falha terminal de nó não vira sucesso do job e que o DoD usa evidence da execution/nó correspondente.
5. Teste um Write Gate pendente: confirme job `WAITING_APPROVAL`, execução recuperável, aprovação/rejeição vinculada à evidence do nó e retomada do mesmo job.
6. Confirme que o Cockpit distingue job durável, execution e mission status. Refaça a validação ao abrir no PWA e no APK.

Se o worker ou a migration estiverem indisponíveis, o endpoint público responde `503 DURABLE_QUEUE_UNAVAILABLE` e **não** executa fallback síncrono.

## Blockers before first production deploy

1. Successful `npm install` + `npm run build` (local or CI green)
2. Prefer committing `package-lock.json` for deterministic installs
3. Set `DATABASE_URL` in Vercel for real health checks
4. Set `CRON_SECRET` and verify the durable worker cron
5. Confirm Neon allows connections from Vercel IPs (Neon default allows)
6. Apply migrations `0024`, `0025` and `0026` through the repository migration workflow, in order

## Out of scope until approved

- Running migrations on Neon
- Auth
- Custom domains / production hardening
