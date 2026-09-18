# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-18 — M4 tool github no dispatcher + GET inventário; identidade “cockpit” marcada como provisória

Este documento registra o estado observado no repositório e no ambiente publicado. A presença de uma tela, rota ou especificação não é suficiente para classificar uma capacidade como verificada.

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Página pública e navegação principal | **VERIFICADO** | Home, login, cadastro, Chat, painel de missão e Configurações carregaram em produção. |
| Autenticação e sessão | **VERIFICADO** | Cadastro, login, logout e novo login foram executados com conta de teste. |
| Isolamento e persistência básica | **VERIFICADO no fluxo testado** | Perfil, missão e preferência de modo permaneceram após novo login. |
| Mission Workspace + listagem + auto-plan | **VERIFICADO no fluxo testado** | Missão criada, aberta e com execução automática. |
| Motion do card de missão | **IMPLEMENTED** | DESIGN_SYSTEM §7; **sem confete**. |
| Runtime / Agent Loop | **VERIFICADO até VERIFYING** | `model_step` + resposta textual. |
| DoD Gate | **VERIFICADO** | Bloqueou COMPLETED sem tool_result. |
| Ferramentas locais (note, filesystem) | **IMPLEMENTED** | Dispatcher + evidência. |
| **Tool github (M4)** | **IMPLEMENTED no código** | `runGithub` + token OAuth; GET `/api/executions/:id/tools` lista disponibilidade. Exercício real exige OAuth + migration 0004. |
| Chat e histórico | **VERIFICADO** | |
| Preferência de modo | **VERIFICADO** | |
| Inferência local Offline | **NÃO VERIFICADO** | |
| Catálogo de modelos | **IMPLEMENTADO / UI** | |
| Configurações | **VERIFICADO como interface** | |
| Links `/ajuda` e `/legal/*` | **PREVISTOS** | Ainda 404 — só conteúdo original. |
| M1 Domain + schema connectors | **IMPLEMENTED** | |
| M2 OAuth GitHub | **IMPLEMENTED; não exercitado** | Precisa `GITHUB_CLIENT_*` + `APP_URL` + secret. |
| M3 UI Conectores | **IMPLEMENTED** | Configurações + sheet no chat. |
| M4 Bridge GitHub → dispatcher | **IMPLEMENTED** | Código em main. |
| M5 Smoke missão com GitHub | **PENDENTE** | Depende de OAuth real. |
| Auditor GitHub Actions | **PENDENTE** | |
| Identidade de superfície (“cockpit”) | **PROVISÓRIA** | Revisar pós-entrega (DECISIONS 2026-09-18). |

## Conectores (M1–M4)

Estados: `disconnected → authorizing → connected → reconnecting → error`

- Tabela `connectors` (migration **0004**)
- Tokens AES-256-GCM
- Tool `github` no dispatcher só com `status === connected` + token
- GET tools: inventário + `available` por conector

### Variáveis de ambiente (OAuth real)

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
CONNECTOR_TOKEN_SECRET=   # ou SESSION_SECRET ≥16 chars
APP_URL=https://seu-dominio
```

Callback: `https://seu-dominio/api/connectors/github/callback`  
Migration: `packages/db/drizzle/0004_connectors.sql` no Neon.

## Pendências confirmadas

1. Env OAuth + migration 0004 → conectar GitHub de verdade.
2. **M5** — missão de fumaça com `tool:github` até evidência.
3. Páginas `/ajuda` e `/legal/*` originais.
4. Revisão de identidade de produto (metáfora/rotas) após entrega estável.
5. Workflow `auditor.yml` (opcional).

## Próximo passo de engenharia

**Bloqueio de produto:** credenciais GitHub OAuth no ambiente de deploy + migration 0004.  
Depois: **M5** smoke end-to-end.  
Em paralelo possível: redigir `/ajuda` e `/legal/*` (pesquisa + original, sem genérico).
