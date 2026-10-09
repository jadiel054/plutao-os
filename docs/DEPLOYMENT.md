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
| `RUNTIME_WORKER_QUEUE_ENABLED` | no; opt-in only | Set to `true` in Production only after reviewing/approving the Vercel Queues wake-up. Unset/false keeps the current scheduled-only trigger. |

Do not expose database URLs to the client.

## What is already deploy-oriented in code

- Next.js App Router in `apps/web`
- `transpilePackages: ["@plutao/db", "@plutao/domain"]`
- `/api/health` does not require DB at build time
- PWA `public/sw.js` + register component
- CI workflow mirrors install + build
- `apps/web/vercel.json` schedules write-gate cleanup daily. The durable worker is polled every five minutes by `.github/workflows/runtime_worker.yml`; the cron is offset from minute zero to reduce top-of-hour contention. The connected Vercel team is Hobby, whose Cron supports only one invocation/day, so it cannot provide a sub-daily worker schedule.
- [GitHub scheduled workflows are best-effort](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): under high load they may be delayed and queued runs may be dropped. The observed Actions history had multi-hour gaps despite the active five-minute schedule; this does not prove the internal cause, but the schedule alone is not sufficient evidence of prompt processing.

## Durable runtime worker (mission execution)

O endpoint `POST /api/missions/:id/autonomous-run` **somente enfileira** uma execution `PENDING` e retorna `202`. O processamento acontece em `POST /api/cron/runtime-worker`, protegido por `Authorization: Bearer $CRON_SECRET`. O workflow `.github/workflows/runtime_worker.yml` chama essa rota a cada cinco minutos na branch padrão e executa antes um probe read-only em `GET /api/cron/runtime-worker/health`.

O código também contém um wake-up opcional via [Vercel Queues](https://vercel.com/docs/queues), atualmente em beta e disponível em todos os planos. Após persistir o job, resolver um Write Gate, continuar um nó ou programar um retry, publica apenas `{version, reason}` (sem IDs, payload de missão ou PII). O consumer privado reutiliza o mesmo handler autenticado do worker; o claim atômico Postgres e `MAX_BATCH=1` continuam inalterados. A fila entrega at-least-once e isola mensagens por deployment; duplicatas não substituem idempotência.

A opção é deliberadamente **desligada por padrão**. Para avaliar em produção, revisar [limites e preços da fila](https://vercel.com/docs/queues/pricing) e [uso de Functions](https://vercel.com/docs/functions/usage-and-pricing), então definir `RUNTIME_WORKER_QUEUE_ENABLED=true` somente no ambiente Production e fazer deploy. O Hobby inclui até 1 milhão de operações de Queue/mês; invocações, CPU e memória das Functions seguem quotas separadas. O cron GitHub continua sendo recuperação caso a publicação/entrega falhe ou expire; Postgres é a fonte durável da missão.

O probe de saúde usa o mesmo bearer do cron, não reivindica jobs e retorna apenas contagens agregadas (`PENDING`, `RUNNING`, `WAITING_APPROVAL` e estados terminais), idade dos itens mais antigos e leases de execução expirados. Ele não retorna `userId`, `missionId`, `executionId`, payload ou texto de erro.

Em produção:

1. Defina `CRON_SECRET` no ambiente da Vercel e como secret do repositório no GitHub Actions, com o mesmo valor.
2. Migrations 0024–0026 já foram aplicadas no Neon `main` em 2026-10-07; confira o schema antes do rollout. O smoke autenticado multi-nó continua pendente.
3. Dispare o workflow e confirme que o probe `GET /api/cron/runtime-worker/health` retorna `200` antes do processamento. O worker serial processa no máximo um job por invocation (`maxBatch = 1`).
4. Execute uma missão de teste com pelo menos dois nós dependentes e confirme que o mesmo job passa por continuations serializadas até `runtime_jobs.SUCCEEDED` e `executions.COMPLETED`.
5. Confirme que uma falha terminal de nó não vira sucesso do job e que o DoD usa evidence da execution/nó correspondente.
6. Teste um Write Gate pendente: confirme job `WAITING_APPROVAL`, execução recuperável, aprovação/rejeição vinculada à evidence do nó e retomada do mesmo job.
7. Confirme que o Cockpit distingue job durável, execution e mission status. Refaça a validação ao abrir no PWA e no APK.

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
