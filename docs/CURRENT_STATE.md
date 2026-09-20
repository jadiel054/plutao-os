# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-18 — stack conectores pronta; M5 aguarda credenciais + migration 0004

Este documento registra o estado observado no repositório. Capacidade só é **VERIFICADA** com evidência de uso real.

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth | **VERIFICADO** | Smoke produção anterior. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM §7. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
| Tool github (M4) | **IMPLEMENTED** | No dispatcher; precisa OAuth + 0004. |
| GET `/api/executions/:id/tools` | **IMPLEMENTED** | Inventário + disponibilidade GitHub. |
| Chat Núcleo + awareness conector | **IMPLEMENTED** | System prompt reflete GitHub. |
| Chat — Fila de Mensagens | **IMPLEMENTED** | Fila de até 3 msgs durante streaming, card compacto, "↑ Enviar agora" / "🗑 Descartar" e disparo sequencial. |
| Chat — Esclarecimento Pré-Tool | **IMPLEMENTED** | Validação pré-execução por capability, consulta silenciosa de repositórios recentes e FollowUpChips para esclarecimento sem card de erro. |
| Card inline Conectar/Pular | **IMPLEMENTED** | `suggestedConnectors` + `ConnectorActionCard`. |
| Navigation `/planos` + Founder Pricing | **VERIFICADO** | Rota `/planos` acessível via MobileNav, Header, UserMenu e ChatHistoryDrawer; preço fundador escalonado (R$19/29/39) por posição. |
| Migration 0006 plans_billing.sql | **IMPLEMENTED** | `packages/db/drizzle/0006_plans_billing.sql` sincronizado com schema e journal. |
| Correções P2 UX & Modelos | **VERIFICADO** | FollowUpChips com envio direto, overflow-wrap em links, deduplicação de stream, polling silencioso em MissionWorkspaceBar, teste real de inferência e fallback/log local de falhas. |
| M1–M3 Conectores UI + OAuth rotas | **IMPLEMENTED** | Sheet, Settings, authorize/callback/disconnect. |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Conteúdo original. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml`. |
| **M5 smoke missão + GitHub** | **PENDENTE** | Credenciais + migration — ver `docs/CONECTORES_M5.md`. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora do fechamento V1 UI/API. |
| Identidade “cockpit” | **PROVISÓRIA** | Revisar pós-entrega. |

## O que o código já faz (sem inventar)

- Estados: `disconnected → authorizing → connected → reconnecting → error`
- Tokens cifrados (AES) em `connectors.access_token_enc`
- Capacidades listadas após OAuth (`repos_list`, `issues_list`, …)
- Executor recusa tool `github` se não houver token válido
- Card no chat só com confirmação do usuário
- Fila de até 3 mensagens no chat enquanto o modelo processa (composer permanece editável)
- Validação prévia de argumentos por capability (ex.: `owner` e `repo` em `issues_list`), oferecendo sugestões via `FollowUpChips` clicáveis que preenchem o input em caso de ambiguidade

## Bloqueio atual (operador)

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
APP_URL=https://seu-dominio
CONNECTOR_TOKEN_SECRET=   # ou SESSION_SECRET ≥16
```

+ aplicar `packages/db/drizzle/0004_connectors.sql` no Neon (URL direta).

Guia completo: **`docs/CONECTORES_M5.md`**.

## Próximo passo

1. Operador preenche env + migration 0004.  
2. Smoke M5 conforme o guia.  
3. Só então marcar M5 como VERIFICADO neste arquivo.
