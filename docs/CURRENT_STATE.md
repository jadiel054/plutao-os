# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-10

## Fase atual

**Phase 1 — Foundation** (IMPLEMENTED parcial; **não VERIFIED** no critério build + conexão Neon)

## Status por área

| Área | Status | Evidência |
|------|--------|-----------|
| Architecture / Spec | DESIGNED | PROJECT_SPECIFICATION.md |
| Product Identity | DECIDED | Nome Plutão |
| Design System | IMPLEMENTED | DESIGN_SYSTEM.md + globals.css |
| GitHub repo | IMPLEMENTED | jadiel054/plutao-os |
| Monorepo | IMPLEMENTED | apps/web, packages/domain, packages/db |
| PWA shell + SW updates | IMPLEMENTED | sw.js, ServiceWorkerRegister |
| Domain types | IMPLEMENTED | @plutao/domain |
| Drizzle schema | IMPLEMENTED | packages/db/src/schema.ts |
| Neon hosting (8 tables) | **VERIFIED (operator)** | Projeto Plutao, SP, Postgres 17, schema aplicado fora do CI |
| Migrations versionadas | **IMPLEMENTED** | packages/db/drizzle/0000_baseline.sql (já no Neon — não reaplicar) |
| Neon client (Drizzle HTTP) | **IMPLEMENTED** | packages/db/src/client.ts |
| GET /api/health | **IMPLEMENTED** | apps/web — erros de DB ofuscados em production |
| package-lock.json | **MISSING** | Não existe no GitHub nem gerado de forma estável no sandbox |
| next build (monorepo) | **NOT VERIFIED** | Sandbox npm instável (EIO/hang); sem evidência de build no path real |
| DATABASE_URL no runtime | **NOT CONFIGURED** | Ausente no sandbox; .env.example documenta |
| App → Neon connection | **NOT VERIFIED** | Depende de DATABASE_URL + runtime estável |
| Authentication | NOT STARTED | Schema pronto; fluxos não |
| Mission Engine | NOT STARTED | Phase 2 |

## Critério VERIFIED (Phase 1 Foundation)

Só sobe para VERIFIED com:

1. lockfile commitado e instalável
2. `next build` (ou typecheck+build) com saída de sucesso
3. `/api/health` com `database.ok: true` contra Neon real

Nenhum dos três está completo neste ambiente de sandbox.

## Neon — regras

- Não rodar `drizzle-kit migrate` no Neon existente sem aprovação
- Baseline 0000 já reflete o banco; não reaplicar
- Stamp/baseline no migrator: explicar SQL e aguardar aprovação antes de qualquer alteração no banco

## Próximo (após verificação)

Auth (cadastro/login/recovery) — **aguardar** build + health VERIFIED.

## Commits recentes (GitHub)

- d656cfc… baseline SQL + schema status
- 9c19a0d… client + health + workspaces
- fd9ac532… health sem expor erros de DB em production
