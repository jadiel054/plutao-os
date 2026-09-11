# Plutão

![Plutão OS](assets/brand/lockups/lockup_escuro_github.svg)

Personal Autonomous AI Operating System — mission-first cockpit.

**Repo:** `jadiel054/plutao-os`  
**Phase:** 1 — Foundation  
**Brand:** [docs/BRAND.md](docs/BRAND.md) (grade 24×24 · φ · Grafite/Platina)

## Stack

- Next.js 15 (App Router) + PWA shell
- TypeScript monorepo (`apps/web`, `packages/domain`, `packages/db`)
- PostgreSQL on Neon (São Paulo) + Drizzle ORM
- Tailwind design tokens (dark-first, brand-aligned)

## Quick start

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
npm install
cp .env.example .env.local   # fill Neon URLs
npm run dev
```

Health: `GET /api/health` · Production: https://plutao-os.vercel.app/api/health

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/PROJECT_SPECIFICATION.md](docs/PROJECT_SPECIFICATION.md) | Architecture baseline |
| [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) | Live status |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log |
| [docs/BRAND.md](docs/BRAND.md) | Brand geometry + palette |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | UI tokens |
| [docs/NEON_SETUP.md](docs/NEON_SETUP.md) | Database connection |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local workflow |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | Phase 1 VERIFIED criteria |

## Important

The Neon schema is **already applied**. Do not run baseline migrations against the live database without explicit approval.
