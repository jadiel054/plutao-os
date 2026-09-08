# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-08 ~01:30 -03

## Status Geral

| Área                        | Status                         | Evidência / Notas                                      |
|----------------------------|--------------------------------|--------------------------------------------------------|
| Architecture               | DESIGNED                       | PROJECT_SPECIFICATION.md v1.0 (seções 1–84)            |
| Product Identity           | **DECIDED + VERIFIED**         | Nome: **Plutão** — código + docs + GitHub              |
| Design System              | **BASELINE IMPLEMENTED**       | DESIGN_SYSTEM.md + tokens em globals.css               |
| Repository (GitHub)        | **IMPLEMENTED**                | https://github.com/jadiel054/plutao-os (privado)       |
| Monorepo structure         | **IMPLEMENTED**                | apps/web, packages/domain, packages/db                 |
| Next.js PWA shell          | **IMPLEMENTED**                | layout, page, tokens, manifest                         |
| PWA update strategy        | **IMPLEMENTED**                | sw.js + ServiceWorkerRegister (skipWaiting + claim)    |
| Domain types               | **IMPLEMENTED**                | @plutao/domain (User, Mission, Task, Agent, Project…)  |
| DB schema (Drizzle)        | **IMPLEMENTED**                | packages/db/src/schema.ts — users, sessions, password_reset_tokens, projects, agents, missions, tasks, audit_events |
| DB migrations              | **NOT STARTED**                | Schema pronto; migrations ainda não geradas/aplicadas  |
| PostgreSQL / Neon hosting  | **NOT STARTED**                | Falta DATABASE_URL + projeto Neon                      |
| Authentication flows       | **NOT STARTED**                | Schema de auth pronto; UI/API de auth ainda não        |
| Build VERIFIED             | **BLOCKED** (sandbox npm)      | Código pronto; npm install lento/instável no sandbox   |
| Mission Engine             | **NOT STARTED**                | Phase 2                                                |
| PROJECT_SPECIFICATION.md   | **RESTORED**                   | Seções 1–28 texto integral no GitHub; 29–84 em part2/part3 |

## O que já existe (evidência)

- Repositório GitHub privado `jadiel054/plutao-os`
- Documentação viva (DECISIONS, CURRENT_STATE, ARCHITECTURE, DESIGN_SYSTEM)
- `docs/PROJECT_SPECIFICATION.md` seções 1–28 completas (commit de restauração)
- apps/web com identidade Plutão + Service Worker
- packages/domain (tipos TypeScript)
- packages/db/src/schema.ts (schema Drizzle completo — **IMPLEMENTED**, migrations não aplicadas)
- Security headers no next.config

## Pendente Phase 1

1. Evidência de `next build` (quando npm estabilizar)
2. Conectar PostgreSQL (Neon) + gerar e aplicar migrations
3. Autenticação completa (cadastro, login, recovery, change password)
4. Observabilidade básica

## Correções desta sincronização (2026-09-08)

1. **PROJECT_SPECIFICATION.md**: seções 4–28 reinseridas com texto integral (antes havia lacuna com nota falsa de “já publicadas”).
2. **CURRENT_STATE.md**: status de DB esclarecido — schema Drizzle = IMPLEMENTED; migrations = NOT STARTED (antes a linha misturava os dois).

## Notas

- Nenhuma decisão arquitetural silenciosa.
- PWA: updates do Vercel via SW sem reinstalação (implementado).
- Schema DB preparado para single-user agora, multi-tenant depois.
