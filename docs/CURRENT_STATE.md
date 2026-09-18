# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-18 — /ajuda + /legal originais; chat ciente de GitHub; M4 completo no código

Este documento registra o estado observado no repositório. Capacidade só é **VERIFICADA** com evidência de uso real.

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth | **VERIFICADO** | Smoke produção anterior. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM §7. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
| Tool github (M4) | **IMPLEMENTED** | Código; precisa OAuth + migration 0004 para exercício. |
| GET `/api/executions/:id/tools` | **IMPLEMENTED** | Inventário + disponibilidade GitHub. |
| Chat Núcleo + awareness conector | **IMPLEMENTED** | System prompt reflete GitHub conectado ou não. |
| M1–M3 Conectores UI + OAuth rotas | **IMPLEMENTED** | Exercício real: credenciais. |
| `/ajuda` | **IMPLEMENTED** | FAQ + fluxo próprio do Plutão. |
| `/legal/termos` | **IMPLEMENTED** | Texto original BR. |
| `/legal/privacidade` | **IMPLEMENTED** | LGPD, dados de missão e conectores. |
| `/legal/licencas` | **IMPLEMENTED** | Stack principal. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml` (estrutura + higiene). |
| M5 smoke missão + GitHub | **PENDENTE** | Credenciais do operador. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora do fechamento V1 de UI/API. |
| Identidade “cockpit” | **PROVISÓRIA** | Revisar pós-entrega. |

## Credenciais ainda necessárias (código pronto)

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
APP_URL=https://seu-dominio
CONNECTOR_TOKEN_SECRET=   # ou SESSION_SECRET ≥16
MODEL_API_KEY=            # se ainda não no deploy
```

Callback OAuth: `{APP_URL}/api/connectors/github/callback`  
SQL: aplicar `packages/db/drizzle/0004_connectors.sql` no Neon.

## Próximo passo quando houver credenciais

1. Migration 0004 + env no Vercel.  
2. Conectar GitHub na UI.  
3. **M5:** missão com tool `github` (`repos_list` ou `issues_list`) até evidência na trilha.
