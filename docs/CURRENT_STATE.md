# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-11

## Fase

**Phase 1 — Foundation** → status agregado: **IMPLEMENTED** (não VERIFIED)

## Matriz de status

| Área | Status | Notas |
|------|--------|-------|
| Spec / architecture docs | DESIGNED | Spec normativa; ARCHITECTURE alinhada ao repo |
| Identidade Plutão | DECIDED | DECISIONS.md |
| Design system baseline | IMPLEMENTED | tokens + DESIGN_SYSTEM.md |
| Monorepo workspaces | IMPLEMENTED | apps/*, packages/* |
| apps/web Next PWA | IMPLEMENTED | layout, page, SW, manifest |
| packages/domain | IMPLEMENTED | types only |
| packages/db schema + baseline | IMPLEMENTED | 8 tables; Neon já aplicado (operator) |
| Neon hosting | VERIFIED (operator) | Fora do CI; schema validado manualmente |
| Neon client + /api/health | IMPLEMENTED | server-only; prod não vaza erro bruto de DB |
| Docs DEV / VERIFY / DEPLOY / NEON | IMPLEMENTED | checklists e prep Vercel |
| CI workflow | IMPLEMENTED | install+build; lockfile opcional (warn) |
| package-lock.json | MISSING | pendência operacional (máquina/CI estável) |
| next build evidence | NOT VERIFIED | depende de ambiente real |
| App→Neon health ok | NOT VERIFIED | depende de DATABASE_URL real |
| Auth | NOT STARTED | — |
| Mission Engine | NOT STARTED | Phase 2 |

## O que NÃO fazer no Neon agora

- migrate / stamp / drop / recreate / alter das 8 tabelas sem aprovação explícita

## Critério VERIFIED

Ver `docs/VERIFICATION.md`: lockfile + build exit 0 + health `database.ok: true`.
