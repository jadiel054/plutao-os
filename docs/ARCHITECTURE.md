# ARCHITECTURE.md — Plutão

**Status:** DESIGNED (runtime engines not implemented)  
**Aligned with:** PROJECT_SPECIFICATION.md Architecture Baseline v1.0

## Runtime target (spec)

```text
USER → PWA → AGENT GATEWAY → MISSION ENGINE → WORKFLOW CORE
  → DURABLE EXECUTION → AGENT RUNTIME
       ├── Context Engine
       ├── Model Router → Model Gateway → Providers
       └── Tool Broker → Policy → Approval → Sandbox
  → Evidence → Verification → State
```

## Princípios arquiteturais ativos

1. Mission-first (chat é interface, não fonte de verdade)
2. Continuity (fechar o PWA não mata a execução)
3. Goal ≠ Plan
4. Verification com evidência independente
5. Security como subsystem explícito
6. Runtime independence (adapters)
7. Evidence e provenance
8. Progressive complexity

## Estrutura de repositório (atual — Phase 1)

```text
plutao-os/
├── apps/
│   └── web/                 # Next.js 15 PWA cockpit
├── packages/
│   ├── domain/              # Shared TypeScript domain types
│   └── db/                  # Drizzle schema, Neon client, migrations
├── services/                # Reserved for future extraction (empty)
├── docs/
├── .github/workflows/ci.yml
├── package.json             # npm workspaces root
└── .env.example
```

## Phase 1 surface (implemented in code)

| Component | Location | Role |
|-----------|----------|------|
| PWA shell | `apps/web` | UI + Service Worker updates |
| Domain types | `packages/domain` | Mission/Task/User types (no runtime logic) |
| Schema | `packages/db/src/schema.ts` | 8 tables aligned with Neon |
| Baseline SQL | `packages/db/drizzle/0000_baseline.sql` | Versioned mirror of Neon (already applied) |
| DB client | `packages/db/src/client.ts` | Neon HTTP + Drizzle |
| Health | `apps/web/src/app/api/health` | Process + optional DB ping |

## Not implemented yet (by design)

- Mission Engine, Agent Runtime, Tool Broker, durable execution
- Authentication flows
- Model gateway / router
- Observability pipeline beyond health

## Data store

- **Neon** PostgreSQL 17 (São Paulo), database `plutao`
- App uses **pooled** `DATABASE_URL`
- Migrations (future) use **direct** `DATABASE_URL_UNPOOLED` only after approval
