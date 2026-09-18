# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-17 — smoke test funcional em produção + M1–M3 conectores GitHub

Este documento registra o estado observado no repositório e no ambiente publicado. A presença de uma tela, rota ou especificação não é suficiente para classificar uma capacidade como verificada. O roteiro e as evidências do ciclo mais recente estão em [`docs/testes/2026-09-17-production-smoke/relatorio-production-smoke.md`](testes/2026-09-17-production-smoke/relatorio-production-smoke.md).

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Página pública e navegação principal | **VERIFICADO** | Home, login, cadastro, Chat, Cockpit e Configurações carregaram em produção. |
| Autenticação e sessão | **VERIFICADO** | Cadastro, login, logout e novo login foram executados com conta de teste. |
| Isolamento e persistência básica | **VERIFICADO no fluxo testado** | Perfil, missão e preferência de modo permaneceram após novo login; não substitui auditoria de isolamento entre contas. |
| Mission Workspace + listagem + auto-plan | **VERIFICADO no fluxo testado** | Missão criada como `CREATED`, aberta no cockpit e recebeu execução automática. |
| Runtime / Agent Loop | **VERIFICADO até `VERIFYING`** | Execução persistida, `model_step` registrado e resposta textual produzida. |
| DoD Gate | **VERIFICADO** | DoD falhou sem `tool_result` e bloqueou `COMPLETED`, como esperado para a missão testada. |
| Registros de evidência | **IMPLEMENTADO / verificado para `model_step`** | A timeline e o painel exibiram a evidência do passo do modelo. Isso não é uma Evidence Engine independente. |
| Ferramentas locais | **IMPLEMENTADO; não concluído neste smoke test** | Dispatcher e filesystem existem no código; não foi produzido `tool_result` real nesta missão. |
| Subtarefas | **VERIFICADO** | Subtarefa criada e exibida na timeline como `CREATED`. |
| Checkpoint manual | **NÃO CONCLUSIVO** | A interface apresentou estado `TERMINAL`; a persistência da nota precisa de novo teste específico. |
| Chat e histórico | **VERIFICADO** | Mensagem respondida e histórico exibido como `Histórico (2)`. |
| Preferência de modo | **VERIFICADO** | `Offline` foi selecionado, exibido como `OFFLINE (CPU)` e persistiu após novo login. |
| Inferência local Offline | **NÃO VERIFICADO** | A preferência foi confirmada, mas o smoke test não comprovou uma resposta produzida localmente. |
| Catálogo de modelos | **IMPLEMENTADO / UI verificada** | 8 modelos listados, 1 local indicado como pronto; modelos não foram testados individualmente. |
| Configurações | **VERIFICADO como interface** | Conta, Notificações, Privacidade e Sobre carregaram. |
| Links de ajuda e documentos legais | **PREVISTOS / A IMPLEMENTAR** | `/ajuda`, `/legal/termos`, `/legal/privacidade` e `/legal/licencas` ainda retornam 404; as páginas estão previstas para uma próxima etapa com conteúdo próprio. |
| Responsividade | **VERIFICADO visualmente** | Alternância desktop/mobile funcionou e manteve o cockpit utilizável. |
| M1 Domain + schema connectors | **IMPLEMENTED** | Domínio e schema de conectores presentes no repositório. |
| M2 OAuth GitHub (authorize / callback / disconnect) | **IMPLEMENTED; não exercitado neste smoke test** | Rotas e serviço existem; OAuth real requer credenciais e callback configurados. |
| M3 UI painel Conectores | **IMPLEMENTED no código; não exercitado neste smoke test** | A implementação está presente; falta evidência funcional deste ciclo. |
| M4 Bridge MCP/tools GitHub → dispatcher | **PENDENTE** | Ainda não implementado. |
| M5 Smoke missão com GitHub | **PENDENTE** | Ainda não executado. |

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

## Pendências confirmadas em produção

1. Implementar as páginas previstas `/ajuda`, `/legal/termos`, `/legal/privacidade` e `/legal/licencas` com conteúdo real e revisar os links após a publicação.
2. Executar uma missão com efeito real de ferramenta para verificar o caminho até `COMPLETED`.
3. Revalidar a persistência de checkpoint manual após reload e novo login.
4. Verificar inferência local real em modo Offline; a preferência persistida não prova o backend de inferência.
5. Executar um ciclo funcional de OAuth GitHub e uma missão de fumaça com GitHub quando as variáveis estiverem configuradas.

## Próximo passo de engenharia

**M4** — tools GitHub no dispatcher (`repos_list`, `issues_list`, …) usando `getAccessToken`, evidência e `plan.events`.
**M5** — missão de fumaça end-to-end.
