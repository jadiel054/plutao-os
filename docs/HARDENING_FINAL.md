# Plutão OS — Relatório final de hardening e operacionalidade

**Data:** 2026-10-07  
**Branch:** `main`  
**Commits finais:** `1b5f939` (hardening) + `403cbc1` (dependências/parser)  
**Base:** `origin/main` (`daf4e64`) + hardening H1–H9/X1/X2 e correções desta revisão

## 1. Escopo executado

Foi feita uma leitura do repositório, da tentativa anterior de hardening, da documentação, do schema/migrations, do projeto Neon **Plutao** e do projeto Vercel **plutao-os**. O foco foi eliminar as causas-raiz de:

- bypass de aprovação humana e replay de writes;
- loops de agente e queima acumulada de tokens entre retomadas;
- vazamento de secrets em traces, SSE, mensagens, evidence e eventos;
- fallback SQL inseguro no Supabase;
- identidade configurada que não chegava ao runtime de missão;
- escape de sandbox por namespace, traversal ou symlink;
- redirects OAuth permissivos e documentação divergente;
- migrations/documentação desatualizadas.

A revisão independente encontrou quatro bloqueios adicionais. Eles também foram corrigidos antes do commit/deploy:

1. fallback SQL do Supabase reutilizava `where` cru;
2. havia saídas SSE/`done.steps`, mensagens e evidence sem redaction em alguns caminhos;
3. missões usavam uma identidade diferente da identidade canônica do chat;
4. o orçamento acumulado podia ser perdido se o checkpoint falhasse, e a deduplicação exigia que a chamada fosse a última tool.

## 2. Achados e solução aplicada

| ID | Problema encontrado | Solução definitiva aplicada |
|---|---|---|
| **H1** | Um booleano/payload controlado pelo cliente podia parecer aprovar write. | `writeGateGuard.ts`, `gates.ts`, rotas de gate e runners usam aprovação server-side, ownership, capability, hash do payload, estado `approved` e consumo single-use. O booleano legado não autoriza execução. |
| **H2** | `force=true` podia contornar Definition of Done. | `transition.ts` e a rota de missão removem o bypass. Sem evidência verificável, o teto é `INCONCLUSIVE`; não se converte em `COMPLETED`. |
| **H3** | Secrets podiam aparecer em trace/evidence/chat. | Sanitização central agora cobre traces SSE, `done.steps`, inputs/outputs completos, reasoning steps, resposta final, `messages`, eventos, evidence de todos os runners, dispatcher, model errors e agent-loop stub. O streaming da resposta final foi bufferizado: só há `content_delta` depois da sanitização completa, evitando vazamento por token dividido entre chunks. |
| **H4** | Filtros Supabase eram concatenados e o fallback Management API reintroduzia SQL cru. | `supabaseFilters.ts` mantém DSL fechada para PostgREST; se PostgREST falha e há filtros, `supabaseWrite.ts` falha fechado e não executa SQL. O fallback SQL só permanece para leitura sem filtro, com tabela/select/limit previamente validados. |
| **H5** | Redirect OAuth podia aceitar HTTPS sem allowlist ou por prefixo. | `tokens.ts` falha fechado sem allowlist, rejeita protocolos perigosos e exige comparação exata de **URI completa**, incluindo caminho; não existe wildcard implícito por origin. PKCE S256, registro do cliente, scopes, code single-use, refresh rotation e revoke permanecem ativos. |
| **H6** | Retomadas podiam reiniciar o contador; chamadas repetidas podiam queimar tokens ou repetir writes. | `agent-loop.ts` aplica teto por request (**20 iterações**), teto acumulado (**60 iterações**), teto acumulado de tokens (**120.000 tokens reportados**), teto de parede (**240 s**), estado recuperável, repetição de proposta/output e ausência de retry automático. `dispatcher.ts` usa deduplicação histórica por `(tool,input hash)` e claim compare-and-swap no checkpoint para impedir duas requests concorrentes de executar a mesma tool. |
| **H7** | Registry/capability ausente podia cair em execução permissiva. | `registry.ts`, `runRestCapability.ts` e dispatcher recusam capability ausente, desabilitada ou sem controles; tools internas são fail-closed. A documentação de capabilities é gerada e testada contra o registro. |
| **H8** | Namespace `default`, IDs inválidos, traversal e symlink podiam escapar da sandbox. | Namespace autenticado exige `userId` + `executionId` válidos; storage local usa raiz real, `realpath` de ancestrais, contenção e revalidação pós-`mkdir`. O teste cobre symlink para fora no backend local. |
| **H9** | Export HTML e caminhos locais eram superfícies de XSS/escape. | Export HTML usa allowlist/escape de title/body e storage por namespace de execução; exports não autenticados não caem em `default`. |
| **X1** | Limites de loop/tokens não tinham defesa completa entre retomadas. | Além dos limites H6, `tokensUsed` é persistido no checkpoint. Se a persistência do orçamento retorna erro ou exceção, o loop falha fechado, tenta marcar a execution como `FAILED` e não anuncia sucesso. |
| **X2** | Perfil de identidade era carregado/descartado ou divergente entre chat e missão. | `loadAgentIdentity()`/`buildIdentityBlock()` são a fonte canônica; `runModelStep()` usa o helper compartilhado e o fallback é `NIX_IDENTITY`. Perfil e personalidade configurados chegam ao system prompt de missão. |

## 3. Arquivos centrais alterados nesta revisão

### Segurança e runtime

- `apps/web/src/lib/connectors/supabaseWrite.ts` — fallback filtrado fail-closed.
- `apps/web/src/lib/runtime/agent-loop.ts` — budget acumulado de iterações/tokens, persistência fail-closed e parada segura.
- `apps/web/src/lib/runtime/types.ts` — `tokensUsed` no contrato de checkpoint.
- `apps/web/src/lib/runtime/tools/dispatcher.ts` — deduplicação histórica e claim compare-and-swap.
- `apps/web/src/lib/runtime/tools/storage.ts` — validação real de raiz, namespace e symlink.
- `apps/web/src/lib/runtime/tools/namespace.ts` — `executionId` obrigatório em namespace autenticado.
- `apps/web/src/lib/runtime/model/step.ts` — identidade canônica e evidence sanitizada.
- `apps/web/src/lib/runtime/model/missionPrompt.ts` — identidade Nix/perfil único no prompt de missão.
- `apps/web/src/lib/runtime/agent-loop-stub.ts` — evidence sanitizada no caminho legado.
- `apps/web/src/lib/missions/recordModelError.ts` — erro/hint sanitizados antes de evidence.
- `apps/web/src/lib/mcp/tokens.ts` — redirect HTTPS com URI completa e caminho exato.
- `apps/web/src/app/api/chat/route.ts` — redaction em SSE, steps, reasoning, resposta e trace; streaming final bufferizado.
- `apps/web/src/app/api/chat/emitConnectorToolEvents.ts` — redaction em action/observation.
- `apps/web/src/lib/chat/persistChatMessages.ts` — redaction antes da tabela `messages`.
- `apps/web/src/lib/chat/{github,vercel,supabase,telegram,cloudflare,generic,export}ToolRunner.ts` — evidence sanitizada por provider.

### Testes adicionados/ajustados

- `apps/web/src/lib/connectors/__tests__/supabase.test.ts` — filtro + falha PostgREST não executa fallback SQL.
- `apps/web/src/lib/chat/__tests__/persistChatMessages.test.ts` — secret não chega à tabela/evento.
- `apps/web/src/lib/runtime/__tests__/agentLoopGuards.test.ts` — soma segura de tokens e constantes de budget.
- `apps/web/src/lib/runtime/model/__tests__/missionSystemPrompt.test.ts` — fallback Nix e perfil personalizado.
- `apps/web/src/lib/runtime/tools/__tests__/sandboxHardening.test.ts` — symlink no storage local.
- Fixtures OAuth em `apps/web/src/app/api/oauth/{authorize,register}/__tests__` — callbacks completas na allowlist.
- `apps/web/src/lib/mcp/__tests__/oauthRedirect.test.ts` — caminho exato também para clientes legados.
- `apps/web/src/lib/cockpit/__tests__/missionRuntimeFixes.test.ts` — checkpoint mockado explicitamente nos cenários unitários.

## 4. Banco Neon

Projeto verificado: **Plutao** (`fragrant-boat-15398274`), branch padrão.

A consulta de schema real em `write_gates` confirmou a presença de:

- `payload_hash text`;
- `consumed_at timestamp with time zone`;
- `consumed_by text`;
- `expires_at timestamp with time zone`;
- índice `write_gates_status_consumed_idx (status, consumed_at)`.
- índice `write_gates_status_expires_idx (status, expires_at)`.

Por isso, **nenhum SQL foi aplicado nesta execução**: a migration aditiva já estava refletida no schema real e reaplicar SQL seria desnecessário. A migration versionada foi organizada como `packages/db/drizzle/0021_hardening_write_gates.sql`, com journal e README coerentes, para novos ambientes/deploys.

A tentativa de consultar `drizzle.__drizzle_migrations` retornou `relation does not exist`; não foi tratada como falha do banco, pois a confirmação relevante foi feita diretamente pelo schema da tabela e dos índices. A migration 0022 adiciona `rate_limit_buckets`, TTL de gates e índices de reaper; ela deve ser aplicada pelo pipeline de migrations antes do deploy desta branch.

## 5. Vercel e configuração de produção

Projeto verificado: **plutao-os**, Next.js, domínio `plutao-os.vercel.app`, deployment final `dpl_ELAMNLj9DAuosvPabw7YenbutWr7` em estado **READY**, associado ao commit `403cbc10a185a1d5f565fed587283c0a8848c840`. Aliases ativos: `plutao-os.vercel.app`, `plutao-os-jadiels-projects-3b6be146.vercel.app` e `plutao-os-git-main-jadiels-projects-3b6be146.vercel.app`. O projeto mantém SSO de deployment habilitado.

Variáveis que precisam estar configuradas no Vercel para produção:

- `DATABASE_URL` — conexão pooled de runtime;
- `DATABASE_URL_UNPOOLED` — somente migrations;
- `SESSION_SECRET`/`AUTH_SECRET`;
- `MCP_TOKEN_SECRET` ou secret equivalente com pelo menos 16 caracteres;
- `MCP_OAUTH_REDIRECT_ALLOWLIST` com **URIs completas**, por exemplo `https://cliente.example/oauth/callback`, separadas por vírgula;
- credenciais dos connectors e `CONNECTOR_TOKEN_SECRET`.

O template `.env.example` e `docs/MCP_SERVER.md` agora deixam explícito que uma entrada HTTPS somente com origin não é wildcard. HTTP continua restrito a `localhost`/`127.0.0.1` para desenvolvimento.

## 6. Auditoria de dependências

O primeiro build de produção reportou 35 avisos do `npm audit` (12 moderados, 19 altos e 4 críticos contando dependências de desenvolvimento). A cadeia foi auditada, sem usar `npm audit fix --force`. Foram aplicadas as correções compatíveis:

- `xlsx`/SheetJS foi removido; o parser de ingestão foi migrado para `exceljs` assíncrono com limite de 1.000 linhas;
- `.xls` legado agora retorna `415` antes de persistir o blob; a interface oferece somente `.xlsx`, evitando parser ambíguo de formato binário antigo;
- `@vercel/blob` foi atualizado para `2.8.1`;
- `drizzle-orm` foi atualizado para `0.45.3`;
- `drizzle-kit` foi atualizado para `0.31.11`;
- `next` permaneceu em `15.5.25` para não introduzir upgrade major automático; o PostCSS resolvido foi fixado em `8.5.29`;
- `shell-quote` foi fixado em `1.11.0`, inclusive para o `gel` opcional do Drizzle.

Após reinstalação limpa, `npm audit --omit=dev` ficou em **0 críticos, 3 altos e 6 moderados**. Os três altos restantes são a cadeia sem correção upstream em `@huggingface/transformers@3.8.1`/`kokoro-js@1.2.1`, que puxa `sharp@0.34.5`; o próprio audit informa **sem correção disponível**. A funcionalidade de voz/modelo local é carregada sob demanda e não concede autenticação, capability, write ou acesso ao banco. O relatório registra esse risco de supply chain explicitamente em vez de mascará-lo como “zero vulnerabilidades”.

## 7. Evidência de qualidade

Checks finais locais após todas as correções:

- `npm run typecheck` — **passou sem erros**;
- `npm run lint` — **0 erros, 14 warnings preexistentes** de lint em componentes/testes não relacionados ao hardening;
- testes direcionados — **10 arquivos / 55 testes aprovados**;
- suíte completa Vitest — **75 arquivos / 421 testes aprovados**;
- `npm run build` — **passou** após externalizar ExcelJS do bundle Turbopack;
- smoke público pós-deploy — `GET /api/health` **200**, `{"ok":true,"database":{"ok":true}}` (latência observada: 1.487 ms) e homepage **200**;
- `git diff --check` — **passou**;
- varredura estática — nenhum fallback `WHERE ${where}` cru, nenhum `Agent: Plutão (default)` no runtime, nenhum `fullInput/fullOutput` cru nos payloads finais de chat.

Os warnings e os `stderr` de testes que simulam ausência de `DATABASE_URL` não são falhas de produção: os testes passam; os fixtures agora mockam `writeCheckpoint` quando o caso é unitário.

## 8. Riscos residuais explicitamente conhecidos

1. **Dependência upstream de voz/modelo:** os 3 alertas altos de `sharp` não têm correção publicada compatível com a cadeia `kokoro-js@1.2.1`/Transformers 3.x. Migrar para Transformers 4.x ou trocar Kokoro é uma mudança funcional major e deve ser validada com áudio real; não foi feita cegamente.
2. **Smoke autenticado no Vercel:** os checks locais e a inspeção do projeto/deployment não substituem um smoke com sessão real, connectors reais e OAuth real. Esse passo depende das credenciais/allowlist configuradas no Vercel.
3. **TOCTOU de filesystem local:** a sandbox revalida `realpath` e contém symlink no fluxo normal. Um processo local hostil que troque symlinks simultaneamente ainda representa a janela clássica de filesystem; não é uma superfície exposta pelo request normal do Plutão.

## 9. Guards distribuídos adicionados após a revisão secundária

- `checkMcpRateLimit()` agora incrementa um bucket atômico em `rate_limit_buckets`; não existe fallback de quota em `Map` local entre instâncias Vercel.
- `write_gates.expires_at` é obrigatório, criado com TTL de 15 minutos e validado tanto antes quanto durante o claim atômico.
- `reapExpiredWriteGates()` marca aprovações expiradas e execuções `executing` abandonadas como `failed`; `/api/cron/cleanup-write-gates` aceita somente `CRON_SECRET` e é declarado no `apps/web/vercel.json` a cada cinco minutos.
- `writeCheckpoint()` e `saveCheckpoint()` usam merge JSONB no SQL e compare-and-swap por `user_id` + checkpoint observado; concorrência perde com `CHECKPOINT_CONFLICT`, nunca sobrescreve silenciosamente o estado mais novo.

Fora esses itens operacionais explícitos, os bloqueios de segurança, identidade, loop, token budget, replay, fallback SQL e documentação identificados na auditoria foram tratados no código e cobertos por testes.
