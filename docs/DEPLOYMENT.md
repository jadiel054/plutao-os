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
| `CRON_SECRET` | yes for durable worker | Same secret in Vercel environment and GitHub Actions secrets; the worker workflow sends it as Bearer authorization |

Do not expose database URLs to the client.

## What is already deploy-oriented in code

- Next.js App Router in `apps/web`
- `transpilePackages: ["@plutao/db", "@plutao/domain"]`
- `/api/health` does not require DB at build time
- PWA `public/sw.js` + register component
- CI workflow mirrors install + build
- `apps/web/vercel.json` schedules write-gate cleanup daily. The durable worker is invoked every five minutes by `.github/workflows/runtime_worker.yml`; no sub-daily worker cron is declared in Vercel because the connected plan permits cron jobs only once per day.

## Durable runtime worker (mission execution)

O endpoint `POST /api/missions/:id/autonomous-run` **somente enfileira** uma execution `PENDING` e retorna `202`. O processamento acontece em `POST /api/cron/runtime-worker`, protegido por `Authorization: Bearer $CRON_SECRET`. O workflow `.github/workflows/runtime_worker.yml` chama essa rota a cada cinco minutos na branch padrão.

Em produção:

1. Defina `CRON_SECRET` no ambiente da Vercel e como secret do repositório no GitHub Actions, com o mesmo valor.
2. Migrations 0024–0026 já foram aplicadas no Neon `main` em 2026-10-07; confira o schema antes do rollout. O smoke autenticado multi-nó continua pendente.
3. Execute uma missão de teste com pelo menos dois nós dependentes e confirme que o mesmo job passa por continuations serializadas até `runtime_jobs.SUCCEEDED` e `executions.COMPLETED`.
4. Confirme que uma falha terminal de nó não vira sucesso do job e que o DoD usa evidence da execution/nó correspondente.
5. Teste um Write Gate pendente: confirme job `WAITING_APPROVAL`, execução recuperável, aprovação/rejeição vinculada à evidence do nó e retomada do mesmo job.
6. Confirme que o Cockpit distingue job durável, execution e mission status. Refaça a validação ao abrir no PWA e no APK.

Se o worker ou a migration estiverem indisponíveis, o endpoint público responde `503 DURABLE_QUEUE_UNAVAILABLE` e **não** executa fallback síncrono.

## Blockers before first production deploy

1. Successful `npm install` + `npm run build` (local or CI green)
2. Prefer committing `package-lock.json` for deterministic installs
3. Set `DATABASE_URL` in Vercel for real health checks
4. Set `CRON_SECRET` in Vercel and GitHub Actions; verify the scheduled worker workflow returns HTTP 200
5. Confirm Neon allows connections from Vercel IPs (Neon default allows)
6. Antes de novas migrations, reconcilie o histórico/baseline do Drizzle: nesta inspeção não foi localizada tabela de histórico nos schemas `drizzle`/`drizzle_meta`; evite reaplicar migrations antigas.

## Out of scope until approved

- Auth
- Custom domains / production hardening
