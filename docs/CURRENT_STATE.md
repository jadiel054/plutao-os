# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-10-07 (Hardening final + worker durável de missões)

Este documento registra o estado observado no repositório e em produção.
Capacidade só é **VERIFICADA** com evidência de uso real (não só código no `main`).

---

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| **Hardening final de segurança, loops e identidade (H1–H9 + X1/X2)** | **IMPLEMENTED — checks locais verdes** | Write gates server-side single-use + hash + ownership; DoD sem `force=true` (teto `INCONCLUSIVE`); sanitização central; filtros Supabase estruturados; OAuth redirect fail-closed + rate limit por grant; sandbox por usuário/execução com IDs validados e symlink real; exports HTML allowlist; registry fail-closed; limite de iterações/tempo/tokens e detecção de não progresso; identidade configurável aplicada ao prompt. Prova detalhada: `docs/HARDENING_FINAL.md`. Smoke Vercel pós-deploy ainda deve ser executado. |
| Navegação e auth (email/senha) | **VERIFICADO** | Smoke produção. |
| Modo Convidado (Guest Mode) | **VERIFICADO** (2026-09-25) | Landing + `POST /api/auth/guest` + limits. Fix auto-create PR #56. Smoke AC3/AC4: pill sobrevive a refresh; LimitModal e cadastro OK. |
| BUG-03. Persistência de conversas/mensagens no servidor | **VERIFICADO** (2026-09-27) | MCP `plutao_send_message` → `list_conversations` 1→2; mesma tabela `conversations` que o drawer da UI. Migration `0016` + API REST. |
| Write gate (GitHub write) | **VERIFICADO** (2026-09-25) | Smoke: `GATE_PENDING` → aprovação humana → repo público `plutao-smoke-gate` criado com README. **Ressalva:** feedback de execução no chat ainda pendente. |
| **H1 — Write gate validado no servidor** | **IMPLEMENTED** (2026-10-07) | Bypass por `_gateApproved` eliminado. Escrita exige `_gateId` do próprio usuário, status `approved`, `payload_hash` conferido e consumo atômico de uso único (`pending → approved → executing → executed`). Migration `0020` aplicada no Neon. Testes: cloudflare/render/supabase/github. |
| **H3 — Sanitização central de segredos** | **IMPLEMENTED** (2026-10-07) | `lib/security/sanitize.ts` aplicado em trace do chat, evidência de missão, `audit_events`, erro para o cliente (com `ref` de correlação) e títulos de conversa. |
| **H9 — Registro de capacidades** | **IMPLEMENTED** (2026-10-07) | `lib/capabilities/registry.ts` como fonte de verdade; `evaluateCapability`/`evaluateInternalTool` fail-closed; `assertRegistryCoverage()` contra manifestos; `docs/CAPABILITIES.md` gerado e verificado em teste de drift. |
| **X1 — Anti-loop de agente (autorizado pelo fundador)** | **IMPLEMENTED** (2026-10-07) | `MAX_TOTAL_ITERATIONS=60` acumulado no checkpoint, teto de 240 s por request, detecção de tool repetida e de output idêntico. Fecha o risco de queima de tokens entre retomadas. |
| **H8 — Isolamento de sandbox por usuário** | **IMPLEMENTED** (2026-10-07) | Namespace `userId__executionId` (fim do `default` compartilhado); resolução de caminho sem mutação de env global; proteção de escape por symlink. |
| **H5 — Rate limit MCP em todas as tools** | **IMPLEMENTED** (2026-10-07) | `withMcpGuards` cobre as 5 tools; bloqueio auditado como `rate_limited`. |
| **H6 — Export HTML sanitizado** | **IMPLEMENTED** (2026-10-07) | Allowlist de tags/atributos em `lib/security/htmlSanitize.ts`; `<script>`, `on*` e `javascript:` neutralizados. |
| **X2 — Identidade do agente aplicada (autorizado pelo fundador)** | **IMPLEMENTED** (2026-10-07) | Perfil de Configurações > Agente (`name`/`identity`/`personality`) era carregado e descartado no chat; o MCP usava persona hardcoded diferente. Agora `lib/agente/identity.ts` alimenta chat e MCP com a mesma identidade e os mesmos princípios operacionais. Default permanece idêntico a `NIX_IDENTITY`. |
| **H4 — Filtros Supabase validados** | **IMPLEMENTED** (2026-10-07) | `lib/connectors/supabaseFilters.ts`: operadores em allowlist, parâmetros reservados recusados, `select` e tabela validados. |
| **Hardening de escrita no chat (Bugs 1, 2 e 3)** | **VERIFICADO** (2026-10-03) | **BUG 1:** Captura e tratamento de erros no pipeline tool -> write gate em `gates.ts`, `tools/*.ts` e `connectorRuntime.ts` com log estruturado e aviso amigável `"Não consegui iniciar a operação <action>: <motivo>"`. **BUG 2:** Validação de nome do projeto Vercel (`/^[a-z0-9][a-z0-9-]{1,50}$/`, min 3 chars), rejeitando tokens inválidos (ex: `"na"`) com pedido de esclarecimento. **BUG 3:** Retorno do campo `label` amigável em `GET /api/model/status` e exibição no Cockpit via `d.label ?? `${d.provider}/${d.model}`. |
| **Fix & Hardening Runtime de Missões (#109+#110+#111)** | **IMPLEMENTED** (2026-10-03) | **#109/#110:** Catch FASE 3 grava evidência `model_error`; `maxDuration = 300` no resume pós-gate; helper `recordModelError.ts` testado. **#111 (Causa raiz MODEL_CALL_FAILED):** Sanitização de payload (`sanitizeMessagesForProvider` no boundary de `client.ts`) descarta propriedades não-padrão como `source` de `toolResultToMessage` antes de serializar requisições aos provedores; correção de label de modelo duplicado com `formatModelLabel` em `/api/model/status` e cockpit, e alias em `resolveConfig.ts`. **Pendente:** smoke formal em produção de missão completa. |
| **Worker durável de missões (laudo 2026-10-07)** | **IMPLEMENTED — testes locais verdes** | `POST /api/missions/:id/autonomous-run` só cria execution/job `PENDING` e retorna `202`; `runtime-worker` faz claim atômico, ativa `PENDING → RUNNING`, executa o loop, e só marca job `SUCCEEDED` quando a execution persistida está `COMPLETED`. Retries usam lease/attempts/backoff; cancelamento é explícito; divergências antigas são reconciliadas. Requer migration `0024`, `CRON_SECRET` e smoke em produção para virar **VERIFIED**. |
| **Preferência de modelo server-side + Resiliência a Rate Limit (#112)** | **IMPLEMENTED** (2026-10-03) | **1.** `PATCH /api/user/preferences` aceita e valida `preferredModel` contra `PRESET_MODELS` (rejeita inexistente com HTTP 400) e grava em `users.preferredModel`; `GET` retorna junto. **2.** `useModelManager.activateModel()` chama API com tratamento de erro visível na UI; `localStorage` vira cache. **3.** `client.ts` anexa `http_status` e `httpStatus` nos erros lançados. **4.** `callModelWithRetry` parseia dica de retry ("try again in Xms/s") e header `Retry-After`, aplicando backoff exponencial com jitter. **Pendente:** smoke em produção. |
| **Modelos Locais "Em Breve" & Remoção de Download Simulado** | **IMPLEMENTED** (2026-10-05) | **1.** Campo `comingSoon?: boolean` adicionado em `AIModel` e marcado `true` para modelos locais em `registry.ts`. **2.** `ModelCard` exibe badge "Em Breve" e desabilita botões de download, atuar e testar. **3.** `useModelManager` sem simulação `setInterval` e sem pré-popular modelo local como baixado. **4.** `/api/user/preferences` rejeita `preferredModel` com `comingSoon: true` via HTTP 400. **Pendente:** evidência em produção. |
| **Hardening de Fallback de Erro no ConnectorRuntime** | **VERIFICADO** (2026-10-03) | Blocos catch de `runConnectedConnectorTools` em `connectorRuntime.ts` retornam `executed: false` (sem `capability` e sem emitir `tool_start` pendente) em caso de exceção de conector, alimentando `contextText` para explicação amigável ao LLM. Teste dedicado `connectorRuntimeCatch.test.ts`. |
| **GitHub Files Write (`github.files.write`)** | **VERIFICADO** (2026-10-03) | Nova capability para escrita/atualização atômica de múltiplos arquivos via Git Data API (Git Trees). Protegida com Write Gate (Princípio 1), verificação pós-escrita (read-back) com detecção de divergência e limites estritos (máx 20 arquivos, 100KB/arquivo, sem path traversal `..`). |
| **GitHub Pro (Branches, PRs, Code Search & Tree)** | **IMPLEMENTED** (2026-10-03) | Capabilities profissionais de repositório: `github.branches.list`/`create`, `github.prs.create`/`list`/`get`, `github.code.search` e `github.tree`. Escritas (branches/PRs) 100% sob Write Gate. Regra de ouro do operador minucioso no system prompt e verificação de leitura pós-escrita. **Pendente:** smoke em produção de branch/PR real. |
| **Exportação de arquivos (`files.export_*`)** | **VERIFICADO** (2026-10-03) | 4 ferramentas nativas de exportação no runtime (`files.export_pdf`, `files.export_xlsx`, `files.export_markdown`, `files.export_html`). Salvam no filesystem pessoal do usuário (`exports/`), sem conector/OAuth/write-gate, com sanitização contra path traversal, limite de 5MB por export, e detector de intenções PT-BR. |
| **Voz on-device (Kokoro + Piper + Supertonic)** | **VERIFICADO comportamental** (Poco C65, 2026-09-27) | Download ~398 MB; erro legível; retomada após rede e após 7 min background. Packs: `kokoro-en`, `piper-pt-br`, Supertonic (chunked Range + IDB partials O(1)). Sanitize markdown (#75), progress tick (#73), pack-scoped errors (#77). **Pendente:** kill-test M3, interrupção M5, inspeção DevTools formal. |
| B1. Login social (Google/GitHub) + Magic Link | **IMPLEMENTED** | Código + migrations 0007; smoke completo depende de `AUTH_*` + Resend em produção. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. Evidence `source` mascarado `model:plutao-primary` (Frente F). |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
| Identidade do Agente (Nix) | **VERIFICADO** (2026-10-07) | Perfil configurável aplicado no chat e no MCP via `lib/agente/identity.ts`; default continua sendo `NIX_IDENTITY`. System prompt configurado com `"Você é Nix, o operador do Plutão OS, assistente pessoal do usuário."`. UI exibe disclaimer discreto condicional "Nix é uma IA e pode cometer erros." quando há mensagens. |
| Chat Núcleo + system prompt | **VERIFICADO** | Respostas reais em produção. |
| Chat — awareness de conectores | **VERIFICADO** | Status + capabilities no prompt. |
| Chat — tools GitHub | **VERIFICADO** | Lista de repositórios com OAuth real (`@jadiel054`). |
| Chat — tools Vercel | **VERIFICADO** | Lista de projetos com token/OAuth real. |
| Chat — FollowUpChips | **IMPLEMENTED** | Chips pós-tool; envio ao toque. |
| Chat — fila de mensagens | **IMPLEMENTED** | Até 3 msgs durante stream. |
| Chat — esclarecimento pré-tool | **IMPLEMENTED** | Validação de args + chips. |
| Card inline Conectar/Pular | **IMPLEMENTED** | `suggestedConnectors` + `ConnectorActionCard`. |
| Extrator de plano (anti falso-positivo) | **IMPLEMENTED** | Não trata inventário de conectores como missão. |
| Conectores UI (Sheet + Configurações) | **IMPLEMENTED** | Estados, gerenciar, catálogo. |
| GitHub OAuth App + callback | **VERIFICADO** | Fluxo completo em produção. |
| Vercel conector | **VERIFICADO** | Conectado e tools em chat. |
| Neon conector (manifest) | **IMPLEMENTED** | Código; smoke token/OAuth pendente. |
| Stripe conector (manifest) | **IMPLEMENTED** | `verifyUrl` `/v1/account`; label email/`acct_` (#77). Smoke reconectar pendente. |
| **Supabase conector** | **IMPLEMENTED (smoke pendente)** | PAT dual-pattern + project_url/service_role_key cifrados; capabilities `projects_list`, `tables_list`, `table_read` (SELECT apenas, máx 100 linhas), e `sql_exec` (Write Gate obrigatório + blocklist DROP/TRUNCATE/ALTER em DATABASE/SCHEMA + máx 10k chars). |
| **Telegram conector** | **IMPLEMENTED** (2026-10-03) | Bot Token do @BotFather (padrão PAT cifrado em `accessTokenEnc`) + `chatId` do usuário cifrado em `refreshTokenEnc`. Tools `telegram.send_message` (timeout 10s, default para chatId configurado), `telegram.get_updates` (com filtro de segurança restrito ao `chatId` configurado, ignorando outros chats silenciosamente) e `telegram.get_me`. Token 100% mascarado em logs, respostas e erros. |
| **Cloudflare conector** | **IMPLEMENTED (smoke pendente)** | API Token cifrado em `accessTokenEnc`. Tools `cloudflare.zones_list`, `cloudflare.dns_records_list`, `cloudflare.pages_projects_list`, `cloudflare.workers_list`, `cloudflare.dns_record_create` (Write Gate) e `cloudflare.pages_deploy` (Write Gate). Limite de 50 itens por lista e erros em PT-BR. |
| **Render conector** | **IMPLEMENTED (smoke pendente)** | API Key cifrada em `accessTokenEnc`. Tools `render.services_list`, `render.service_get` (com resumo de chaves de env sem valores), `render.deploys_list`, `render.deploy_trigger` (Write Gate) e `render.env_set` (Write Gate com valor mascarado no preview). Erros em PT-BR e timeout de 15s. |
| **Conectores conectados (operador)** | **4/4 connected** (2026-09-27) | GitHub, Vercel, e demais no catálogo ativo do operador — revalidar após deploys. |
| **MCP fase 2** | **VERIFICADO** (2026-09-27) | OAuth consent dual-scope (`mcp:read`+`mcp:write`); `plutao_send_message`; auditoria `audit_events`; rate limit; `system_status.model` = `plutao-primary`; persistência chat (BUG-03 fechado). |
| Model resolve (`id → apiModel`) | **IMPLEMENTED** | `resolveConfig.ts`; roteamento principal e rota alternativa verificados. |
| Model test + fallback UI | **IMPLEMENTED** | `/api/model/test`; logs locais; depende de chaves por provedor. |
| Navigation `/planos` + founder pricing | **VERIFICADO** | R$19 / R$29 / R$39 por posição. |
| **UX de Configurações & Conectores** | **VERIFICADO** (2026-10-03) | Sincronização de abas com URL (`?tab=<id>`) e `localStorage` (`plutao_settings_tab`); feedback inline/toast pós-callback OAuth com limpeza de query (`connector_ok`/`connector_error`); cards com status `error` destacam "Tentar novamente" com resumo de `lastError`; botão "Conectar OAuth" desabilitado com spinner durante `authorizing`/`busy` para eliminar double-submit (`STATE_MISMATCH`); **Re-sync silencioso de capabilities** para conectores 'connected' na abertura das Configurações prevenindo drift com el manifesto (sem alterar tokens nem status); **Modal de confirmação ao desconectar** que exibe o limite de conectores do plano do usuário (`userPlan.connectorsMax`) e alerta extra se o usuário estiver no limite ou acima. |
| Tour guiado com spotlight (onboarding) | **VERIFICADO** (2026-10-03) | `GuidedTour.tsx` + SVG mask cutout overlay + 6 passos + auto-skip de elementos ausentes + trava de scroll + ESC handler + persistência em `POST /api/user/preferences` & `localStorage` (`plutao_onboarding_seen`). |
| Billing Stripe (checkout/webhook) | **IMPLEMENTED** — TEST **6/6** (2026-09-25) | Checkout, webhook, idempotência, cancelamento em modo TEST. LIVE pendente (ativação conta operador). Migration 0012. |
| B2. Ações por conversa | **IMPLEMENTED** | Rename, pin, share, delete, move project; ownership 403; testes #76. |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Conteúdo estático; bot de ajuda **pendente**. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml`. |
| Migrations 0000–0012 + **0015** + **0016** no repo | **IMPLEMENTED** | 0012 stripe; **0015** preferences; **0016** conversations/messages. |
| H2 — DoD sem bypass `force` | **IMPLEMENTED** (2026-10-07) | `force` removido de `transition.ts` e ignorado na rota; novo status terminal `INCONCLUSIVE`; sem evidência o teto nunca é `COMPLETED`. Teste: `dodInconclusive.test.ts`. |
| H7 — Capabilities fail-closed | **IMPLEMENTED** (2026-10-07) | Fallback permissivo do GitHub removido; capability ausente = negado em todos os conectores, via `capabilityBlockReason`. Testes por conector. |
| Migrations no Neon produção | **IMPLEMENTED** (2026-10-07) | Tabelas de 0000–0019 presentes em produção; **0020_hardening_write_gates aplicada e verificada** (colunas `payload_hash`, `consumed_at`, `consumed_by` + índice). |
| Smoke M5 formal (missão + tool + evidência) | **PARCIAL** | Tools no chat OK; trilha formal ainda a formalizar. |
| Durable execution gerenciado (Inngest etc.) | **DESIGNED** | O worker durável local com `runtime_jobs` está implementado; adapter gerenciado permanece uma evolução, não um requisito para o contrato atual. |
| Identidade “Cockpit” | **PROVISÓRIA** | Revisar pós-estabilização. |
| PWA / APK lojas | **PLANEJADO** | Após V1 web estável. |
| TypeScript monorepo | **ALIGNED** (Frente F) | Root + workspaces em `typescript` ^5 (Next 15 tooling). |

---

## O que o código já faz (sem inventar)

- Botão "Explorar como convidado" na Landing; `POST /api/auth/guest`; limits 10 msgs / 15 min + 3 sessões/IP/dia
- Persistência server: `conversations` + `messages`; MCP write e UI drawer na mesma tabela
- Estados de conector: `disconnected → authorizing → connected → reconnecting → error`
- Tokens cifrados (AES) em `connectors.access_token_enc`
- Runtime carrega catálogo + status real + capabilities no system prompt
- Sync silencioso de capabilities de conectores conectados em `listConnectorsForUser` comparando o estado do banco com a única fonte de verdade (`getDefaultCapabilities` do manifesto), atualizando a tabela `connectors` sem tocar em tokens ou status
- Modal de confirmação ao clicar "Desconectar" informando limite do plano do usuário ("Seu plano permite até N conectores ativos.") e aviso extra ("Reconectar depois pode ser bloqueado pelo limite do plano.") se conectores ativos >= limite
- Defesa em profundidade padronizada: todas as queries `db.update(missions)` em runners de chat filtram obrigatoriamente por `missionId` e `userId`
- Tools só executam se o conector estiver **conectado**
- Write gate GitHub: aprovação humana via WriteGateCard antes de create/push/github.files.write
- Capability `github.files.write`: cliente `githubFiles.ts` com suporte a atômico Git Trees API, limites de 20 arquivos e 100KB por arquivo, além de verificação pós-escrita (read-back) e prevenção contra path traversal `..`
- Conector Supabase: PAT + par opcional project_url / service_role_key cifrados; capabilities `supabase.projects_list`, `supabase.tables_list`, `supabase.table_read` (SELECT apenas, limite máx 100 linhas), `supabase.sql_exec` (Write Gate obrigatório com preview de 200 chars, limite máx 10k chars, defesa com blocklist explícita contra DROP/TRUNCATE/ALTER em DATABASE/SCHEMA)
- Conector Telegram: Bot Token + chatId configurável e cifrados; capabilities `telegram.send_message`, `telegram.get_updates` (com filtro estrito de chatId por segurança) e `telegram.get_me`; mascara token em todas as saídas e erros; helper text no painel ensina a descobrir o chatId mandando /start pro bot
- Conector Cloudflare: API Token cifrado; capabilities `cloudflare.zones_list`, `cloudflare.dns_records_list`, `cloudflare.pages_projects_list`, `cloudflare.workers_list`, `cloudflare.dns_record_create` (Write Gate) e `cloudflare.pages_deploy` (Write Gate); limites de 50 itens por lista e mensagens de erro amigáveis em PT-BR
- Conector Render: API Key cifrada; capabilities `render.services_list`, `render.service_get` (detalhes e chaves de env sem valores), `render.deploys_list`, `render.deploy_trigger` (Write Gate) e `render.env_set` (Write Gate com valor mascarado no preview); erros amigáveis em PT-BR e timeout de 15s
- Marcos "GitHub Pro": `githubBranches.ts` (list/create + validação de chars/`..` e existência), `githubPulls.ts` (create/list/get + validação de head/base e política de merge humano), `githubCode.ts` (code search + tree) e `operating-principles.ts` (regra de ouro do operador minucioso no system prompt)
- Exportação nativa de arquivos (`export.ts` + `exportToolRunner.ts`): PDF via `pdf-lib` (A4, quebras de página, rodapé "Gerado pelo Plutão OS"), XLSX via `exceljs`, Markdown com frontmatter YAML, e HTML autônomo com tema escuro acinzentado. Sanitização de caminhos salvos em `/exports/`, limite de 5MB, e intenções PT-BR ativadas direto no chat ("gerar pdf", "exportar planilha", "criar markdown/html")
- Hardening do caminho de escrita do chat: todo erro na criação do gate ou execução de ferramentas vira log estruturado (`console.error`) e mensagem visível de erro no chat ("Não consegui iniciar a operação..."), sem falhas silenciosas
- Validação estrita do nome de projeto Vercel no runner (`isValidVercelProjectName`), bloqueando nomes < 3 caracteres ou com caracteres inválidos (ex: "na") antes da criação do gate
- Status do modelo no Cockpit exibe o label amigável retornado pela rota `/api/model/status`
- Runtime de missões isolado (#109+#110): resolução de `users.preferredModel` via `resolveCloudModelConfig`, retry com backoff (`callModelWithRetry`), prompt com awareness de conectores (`missionPrompt.ts`), resume automático pós-gate em `api/gates/[id]/route.ts` com `maxDuration = 300`, e helper `recordModelError` para gravação segura de evidência de erro de modelo
- `resolveCloudModelConfig(id)` mapeia catálogo → provider + apiModel + baseUrl + env keys
- Evidence de model_step: `source: "model:plutao-primary"` (não vaza groq/openai ids)
- Sanitização estrita de payload de mensagens no boundary do provedor (`client.ts`: `sanitizeMessagesForProvider`) descartando propriedades internas como `source` antes da serialização
- MCP: OAuth 2.1+PKCE, scopes read/write, audit, rate limit (todas as tools), tools listadas em `docs/MCP_SERVER.md`
- Hardening de segurança (2026-10-07): write gate validado no servidor com hash de payload e uso único; sanitizador central de segredos; registro tipado de capacidades com doc gerado; anti-loop de agente com orçamento acumulado; isolamento de sandbox por usuário; export HTML com allowlist; filtros Supabase estruturados. Detalhes em `docs/HARDENING_2026-10.md`
- Voz: Kokoro / Piper / Supertonic; sanitizeForSpeech; pack errors humanizados; playback tick
- Billing TEST: checkout + webhook + idempotência; founder plans → `caronte` / `orbita_livre`; entitlement administrativo protegido via `users.plan_locked` e migration `0023_plan_entitlement_lock` impede que eventos Stripe rebaixem contas concedidas, mantendo customer/subscription IDs para auditoria

---

## Checklist V1 (objetivo)

### Operação

- [x] Confirmar no Neon: migrations **0004–0010** (0005 skip deliberado)
- [ ] Neon: aplicar **0011_write_gates** + **0012_stripe_billing** + **0015_user_preferences** se ainda pendente
- [ ] Vercel env modelos: `MODEL_PROVIDER`, `MODEL_API_KEY` ou chave específica do provedor selecionado, opcional `MODEL_NAME`, `MODEL_BASE_URL`
- [ ] Vercel env Stripe LIVE (após ativação): secrets + price IDs
- [ ] Stripe Dashboard LIVE: Products founder + webhook
- [ ] Smoke modelos: chat default + teste em Configurações → Modelos
- [ ] Smoke conectores: revalidar 4/4 após deploys; Stripe accountLabel pós-#77
- [ ] Smoke GitHub Pro: criar branch → escrever arquivos nela → abrir PR → consultar CI/runs em repositório de teste em produção
- [ ] Smoke B2: pin + `/share/[token]`
- [x] Smoke guest AC3/AC4 — 2026-09-25
- [x] Smoke billing AC1–AC6 em **TEST** — 2026-09-25
- [ ] Smoke billing em **LIVE**
- [x] Smoke write gate — 2026-09-25; feedback no chat pendente
- [x] Smoke voz comportamental (Poco C65) — 2026-09-27; kill-test M3 / M5 pendentes
- [x] Smoke MCP fase 2 (consent dual, write, audit, persistência) — 2026-09-27

### Produto (próximo ciclo)

- [ ] Feedback de execução no chat do write-gate
- [ ] Retry/resume Kokoro/Piper com partials generalizados (padrão Supertonic)
- [ ] Neon conector: token/OAuth + tool no chat
- [ ] Stripe conector smoke + billing LIVE
- [ ] Seletor AUTO / preferredModel: só ids com rota + chave
- [ ] Smoke missão formal: chat → plano → tool → evidência
- [ ] Smoke worker durável: enqueue `202` → cron claim → execution `COMPLETED`/job `SUCCEEDED`; falha de modelo → job `FAILED` ou `PENDING`, nunca sucesso falso
- [ ] Central de ajuda: FAQ + bot (sem genérico)

### Explicitamente fora do V1

- Adapter de execução gerenciado (Inngest etc.); o worker local de `runtime_jobs` faz parte do fechamento atual
- APK / lojas de app
- Modelo próprio treinado
- Wave C completa (Linear, Notion, Sentry, …)

---

## Env de referência (produção)

```
APP_URL=https://plutao-os.vercel.app
SESSION_SECRET=
CONNECTOR_TOKEN_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MODEL_PROVIDER=<provedor-configurado>
MODEL_API_KEY=
MODEL_NAME=<modelo-configurado>
MODEL_BASE_URL=<endpoint-configurado>
GROQ_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
AUTH_GITHUB_CLIENT_ID=
AUTH_GITHUB_CLIENT_SECRET=
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FOUNDER19=price_...
STRIPE_PRICE_FOUNDER29=price_...
STRIPE_PRICE_FOUNDER39=price_...
MCP_TOKEN_SECRET=
PLUTAO_MCP_API_KEY=
PLUTAO_MCP_USER_ID=
DATABASE_URL=
CRON_SECRET=
```

Guia conectores: **`docs/CONECTORES_M5.md`**. MCP: **`docs/MCP_SERVER.md`**.
