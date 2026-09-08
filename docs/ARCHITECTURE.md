# ARCHITECTURE.md — Plutão

**Status:** Living document  
**Fonte autoritativa de requisitos:** `PROJECT_SPECIFICATION.md`

## Visão de alto nível

```
USER
  │
  ▼
PWA (Plutão Cockpit)          ← apps/web (Next.js)
  │
  ▼
Agent Gateway / API Layer
  │
  ▼
Mission Engine
  │
  ▼
Workflow Core + Durable Execution (adapter)
  │
  ▼
Agent Runtime
  ├── Context Engine
  ├── Model Router → Model Gateway → Providers
  └── Tool Broker → Policy → Approval → Sandbox
  │
  ▼
Evidence → Verification → State
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

## Estrutura de repositório (atual)

```
plutao/
├── apps/
│   └── web/                 # Next.js PWA (cockpit)
├── packages/
│   ├── domain/              # Tipos e entidades de domínio
│   ├── ui/                  # (futuro) componentes e tokens
│   └── config/              # (futuro) configs compartilhadas
├── services/                # Reservado para extração futura
├── docs/
│   ├── PROJECT_SPECIFICATION.md
│   ├── ARCHITECTURE.md
│   ├── CURRENT_STATE.md
│   ├── DECISIONS.md
│   └── DESIGN_SYSTEM.md
└── ...
```

## Decisões de stack (resumo)

| Camada              | Escolha atual                          | Observação                          |
|---------------------|----------------------------------------|-------------------------------------|
| Frontend / PWA      | Next.js (App Router) + TS + Tailwind   | Atualizações transparentes via SW   |
| Estilo              | Tailwind + Design Tokens               | Dark-first, leve                    |
| Banco               | PostgreSQL                             | Neon como candidato forte           |
| Auth                | Completa desde Phase 1                 | Provider a ser escolhido            |
| Durable Execution   | Adapter + Inngest (candidato)          | Não acoplar domínio                 |
| Ícones              | Lucide + oficiais de marcas            | —                                   |
| Loaders             | LDRS                                   | Apenas espera real                  |

## Fases de implementação

Ver `PROJECT_SPECIFICATION.md` seção 66.

Atualmente executando **Phase 1 — Foundation**.
