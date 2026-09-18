# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-18 — card inline Conectar/Pular no chat; /ajuda + /legal; M4 no código

Este documento registra o estado observado no repositório. Capacidade só é **VERIFICADA** com evidência de uso real.

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth | **VERIFICADO** | Smoke produção anterior. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM §7. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
| Tool github (M4) | **IMPLEMENTED** | Código; precisa OAuth + migration 0004. |
| GET `/api/executions/:id/tools` | **IMPLEMENTED** | Inventário + disponibilidade GitHub. |
| Chat Núcleo + awareness conector | **IMPLEMENTED** | System prompt reflete GitHub conectado ou não. |
| **Card inline Conectar/Pular** | **IMPLEMENTED** | `suggestedConnectors` na API + `ConnectorActionCard` no fio do chat (estilo ação no chat). |
| M1–M3 Conectores UI + OAuth rotas | **IMPLEMENTED** | Sheet + Configurações; exercício real: credenciais. |
| `/ajuda` | **IMPLEMENTED** | FAQ + fluxo próprio do Plutão. |
| `/legal/termos` | **IMPLEMENTED** | Texto original BR. |
| `/legal/privacidade` | **IMPLEMENTED** | LGPD, dados de missão e conectores. |
| `/legal/licencas` | **IMPLEMENTED** | Stack principal. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml`. |
| M5 smoke missão + GitHub | **PENDENTE** | Credenciais do operador. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora do fechamento V1 de UI/API. |
| Identidade “cockpit” | **PROVISÓRIA** | Revisar pós-entrega. |

## Card de conector no chat

Quando a mensagem pede capacidade GitHub e o conector **não** está conectado:

1. `/api/chat` devolve `suggestedConnectors` (detecção determinística em `lib/chat/suggestConnectors.ts`).
2. O chat renderiza `ConnectorActionCard`: **Conectar** (OAuth) / **Pular** / ver todos.
3. Nada é conectado sem confirmação explícita do usuário.

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
2. Conectar GitHub na UI (sheet, settings ou **card no chat**).  
3. **M5:** missão com tool `github` até evidência na trilha.
