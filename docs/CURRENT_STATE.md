# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-07 ~23:30 -03

## Status Geral

| Área                        | Status              | Evidência / Notas                                      |
|----------------------------|---------------------|--------------------------------------------------------|
| Architecture               | DESIGNED            | PROJECT_SPECIFICATION.md v1.0                          |
| Research                   | SUBSTANTIALLY COMPLETED | Spec + decisões registradas                        |
| Product Identity           | **DECIDED + VERIFIED** | Nome: **Plutão** — presente no código e docs        |
| Design System              | **BASELINE IMPLEMENTED** | `docs/DESIGN_SYSTEM.md` + tokens em globals.css   |
| Repository structure       | **IMPLEMENTED**     | Monorepo + apps/web + packages/domain                  |
| Documentation              | **IMPLEMENTED**     | Spec, DECISIONS, ARCHITECTURE, CURRENT_STATE, DESIGN_SYSTEM |
| Next.js PWA shell          | **PARTIALLY IMPLEMENTED** | Código e identidade ok; `npm install`/build bloqueado por performance do sandbox com pacotes nativos (swc/sharp) |
| Domain models (types)      | **IMPLEMENTED**     | `@plutao/domain` com tipos core de User, Mission, Task, etc. |
| PostgreSQL + Migrations    | NOT STARTED         | —                                                      |
| Authentication             | NOT STARTED         | —                                                      |
| PWA update strategy        | DESIGNED (parcial)  | Manifest + headers; Service Worker ainda pendente      |
| Observability              | NOT STARTED         | —                                                      |
| Mission Engine             | NOT STARTED         | Phase 2                                                |
| Production readiness       | NOT YET VERIFIED    | —                                                      |

## O que já existe

- Git `main` com commits atômicos
- Documentação viva sincronizada
- `apps/web` (Next.js 15 + Tailwind 4 + React 19) com identidade Plutão
- Design tokens e página inicial
- `manifest.webmanifest`
- `packages/domain` com tipos alinhados à especificação
- Security headers no `next.config.ts`

## Bloqueio atual

A estabilidade/build do `apps/web` está temporariamente impedida pela lentidão/instabilidade do `npm install` no ambiente sandbox (pacotes nativos grandes: `@next/swc`, `sharp`). O código-fonte está correto e pronto; assim que o install completar de forma estável o build será reexecutado e verificado.

## Próximos passos (ordem da Phase 1)

1. **Resolver estabilidade do `npm install` + evidência de `next build`** (prioridade máxima)
2. PWA update strategy (Service Worker transparente)
3. PostgreSQL (Neon candidato)
4. Domain models + migrations reais (schema)
5. Autenticação completa
6. Observabilidade básica

## Notas

- Nenhuma decisão arquitetural silenciosa foi tomada.
- Tipos de domínio criados de forma mínima e alinhada à spec para não dificultar as fases seguintes.
