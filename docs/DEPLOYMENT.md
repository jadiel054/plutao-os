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

Do not expose database URLs to the client.

## What is already deploy-oriented in code

- Next.js App Router in `apps/web`
- `transpilePackages: ["@plutao/db", "@plutao/domain"]`
- `/api/health` does not require DB at build time
- PWA `public/sw.js` + register component
- CI workflow mirrors install + build

## Blockers before first production deploy

1. Successful `npm install` + `npm run build` (local or CI green)
2. Prefer committing `package-lock.json` for deterministic installs
3. Set `DATABASE_URL` in Vercel for real health checks
4. Confirm Neon allows connections from Vercel IPs (Neon default allows)

## Out of scope until approved

- Running migrations on Neon
- Auth
- Custom domains / production hardening
