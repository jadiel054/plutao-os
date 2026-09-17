# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-17 — M1+M2 conectores GitHub OAuth + painel

## Matriz

| Área | Status |
|------|--------|
| Mission Workspace + tools→View + auto-plan + stop (1.3) | **IMPLEMENTED** |
| **M1 Domain + schema connectors** | **IMPLEMENTED** |
| **M2 OAuth GitHub (authorize / callback / disconnect)** | **IMPLEMENTED** |
| **M3 UI painel Conectores** | **IMPLEMENTED** |
| M4 Bridge MCP/tools GitHub → dispatcher | **PENDENTE** |
| M5 Smoke missão com GitHub | **PENDENTE** |

## Conectores (M1–M3)

Estados: `disconnected → authorizing → connected → reconnecting → error`

- Tabela `connectors` (migration **0004**)
- Tokens AES-256-GCM (`CONNECTOR_TOKEN_SECRET` ou `SESSION_SECRET`)
- `POST /api/connectors/github/authorize` → URL OAuth
- `GET /api/connectors/github/callback` → troca code, capabilities, `connected`
- `POST /api/connectors/github/disconnect` → limpa tokens
- Configurações → aba **Conectores**

### Variáveis de ambiente (obrigatórias para conectar de verdade)

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
CONNECTOR_TOKEN_SECRET=   # ou SESSION_SECRET ≥16 chars
APP_URL=https://seu-dominio   # callback estável (recomendado)
```

GitHub OAuth App → Authorization callback URL:
`https://seu-dominio/api/connectors/github/callback`

### Migration

Aplicar `packages/db/drizzle/0004_connectors.sql` no Neon (`DATABASE_URL_UNPOOLED`).

## Próximo passo de engenharia

**M4** — tools GitHub no dispatcher (repos_list, issues_list, …) usando `getAccessToken`, evidência + plan.events.
**M5** — missão de fumaça end-to-end.
