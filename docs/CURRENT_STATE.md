# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-28 (Frente F housekeeping)

Este documento registra o estado observado no repositório e em produção.
Capacidade só é **VERIFICADA** com evidência de uso real (não só código no `main`).

---

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth (email/senha) | **VERIFICADO** | Smoke produção. |
| Modo Convidado (Guest Mode) | **VERIFICADO** (2026-09-25) | Landing + `POST /api/auth/guest` + limits. Fix auto-create PR #56. Smoke AC3/AC4: pill sobrevive a refresh; LimitModal e cadastro OK. |
| BUG-03. Persistência de conversas/mensagens no servidor | **VERIFICADO** (2026-09-27) | MCP `plutao_send_message` → `list_conversations` 1→2; mesma tabela `conversations` que o drawer da UI. Migration `0016` + API REST. |
| Write gate (GitHub write) | **VERIFICADO** (2026-09-25) | Smoke: `GATE_PENDING` → aprovação humana → repo público `plutao-smoke-gate` criado com README. **Ressalva:** feedback de execução no chat ainda pendente. |
| **GitHub Files Write (`github.files.write`)** | **VERIFICADO** (2026-10-03) | Nova capability para escrita/atualização atômica de múltiplos arquivos via Git Data API (Git Trees). Protegida com Write Gate (Princípio 1), verificação pós-escrita (read-back) com detecção de divergência e limites estritos (máx 20 arquivos, 100KB/arquivo, sem path traversal `..`). |
| **GitHub Pro (Branches, PRs, Code Search & Tree)** | **IMPLEMENTED** (2026-10-03) | Capabilities profissionais de repositório: `github.branches.list`/`create`, `github.prs.create`/`list`/`get`, `github.code.search` e `github.tree`. Escritas (branches/PRs) 100% sob Write Gate. Regra de ouro do operador minucioso no system prompt e verificação de leitura pós-escrita. **Pendente:** smoke em produção de branch/PR real. |
| **Exportação de arquivos (`files.export_*`)** | **VERIFICADO** (2026-10-03) | 4 ferramentas nativas de exportação no runtime (`files.export_pdf`, `files.export_xlsx`, `files.export_markdown`, `files.export_html`). Salvam no filesystem pessoal do usuário (`exports/`), sem conector/OAuth/write-gate, com sanitização contra path traversal, limite de 5MB por export, e detector de intenções PT-BR. |
| **Voz on-device (Kokoro + Piper + Supertonic)** | **VERIFICADO comportamental** (Poco C65, 2026-09-27) | Download ~398 MB; erro legível; retomada após rede e após 7 min background. Packs: `kokoro-en`, `piper-pt-br`, Supertonic (chunked Range + IDB partials O(1)). Sanitize markdown (#75), progress tick (#73), pack-scoped errors (#77). **Pendente:** kill-test M3, interrupção M5, inspeção DevTools formal. |
| B1. Login social (Google/GitHub) + Magic Link | **IMPLEMENTED** | Código + migrations 0007; smoke completo depende de `AUTH_*` + Resend em produção. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. Evidence `source` mascarado `model:plutao-primary` (Frente F). |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
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
| **Conectores conectados (operador)** | **4/4 connected** (2026-09-27) | GitHub, Vercel, e demais no catálogo ativo do operador — revalidar após deploys. |
| **MCP fase 2** | **VERIFICADO** (2026-09-27) | OAuth consent dual-scope (`mcp:read`+`mcp:write`); `plutao_send_message`; auditoria `audit_events`; rate limit; `system_status.model` = `plutao-primary`; persistência chat (BUG-03 fechado). |
| Model resolve (`id → apiModel`) | **IMPLEMENTED** | `resolveConfig.ts`; default xAI `grok-4.6`; Gemini 3.1 corrigido. |
| Model test + fallback UI | **IMPLEMENTED** | `/api/model/test`; logs locais; depende de chaves por provedor. |
| Navigation `/planos` + founder pricing | **VERIFICADO** | R$19 / R$29 / R$39 por posição. |
| Tour guiado com spotlight (onboarding) | **VERIFICADO** (2026-10-03) | `GuidedTour.tsx` + SVG mask cutout overlay + 6 passos + auto-skip de elementos ausentes + trava de scroll + ESC handler + persistência em `POST /api/user/preferences` & `localStorage` (`plutao_onboarding_seen`). |
| Billing Stripe (checkout/webhook) | **IMPLEMENTED** — TEST **6/6** (2026-09-25) | Checkout, webhook, idempotência, cancelamento em modo TEST. LIVE pendente (ativação conta operador). Migration 0012. |
| B2. Ações por conversa | **IMPLEMENTED** | Rename, pin, share, delete, move project; ownership 403; testes #76. |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Conteúdo estático; bot de ajuda **pendente**. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml`. |
| Migrations 0000–0012 + **0015** + **0016** no repo | **IMPLEMENTED** | 0012 stripe; **0015** preferences; **0016** conversations/messages. |
| Migrations no Neon produção | **VERIFICADO** (até 0010; 0016 operacional via chat/MCP) | 0011 write_gates / 0012 / 0015: confirmar SQL manual se ainda pendente. |
| Smoke M5 formal (missão + tool + evidência) | **PARCIAL** | Tools no chat OK; trilha formal ainda a formalizar. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora do fechamento V1. |
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
- Tools só executam se o conector estiver **conectado**
- Write gate GitHub: aprovação humana via WriteGateCard antes de create/push/github.files.write
- Capability `github.files.write`: cliente `githubFiles.ts` com suporte a atômico Git Trees API, limites de 20 arquivos e 100KB por arquivo, além de verificação pós-escrita (read-back) e prevenção contra path traversal `..`
- Marcos "GitHub Pro": `githubBranches.ts` (list/create + validação de chars/`..` e existência), `githubPulls.ts` (create/list/get + validação de head/base e política de merge humano), `githubCode.ts` (code search + tree) e `operating-principles.ts` (regra de ouro do operador minucioso no system prompt)
- Exportação nativa de arquivos (`export.ts` + `exportToolRunner.ts`): PDF via `pdf-lib` (A4, quebras de página, rodapé "Gerado pelo Plutão OS"), XLSX via `exceljs`, Markdown com frontmatter YAML, e HTML autônomo com tema escuro acinzentado. Sanitização de caminhos salvos em `/exports/`, limite de 5MB, e intenções PT-BR ativadas direto no chat ("gerar pdf", "exportar planilha", "criar markdown/html")
- `resolveCloudModelConfig(id)` mapeia catálogo → provider + apiModel + baseUrl + env keys
- Evidence de model_step: `source: "model:plutao-primary"` (não vaza groq/openai ids)
- MCP: OAuth 2.1+PKCE, scopes read/write, audit, rate limit, tools listadas em `docs/MCP_SERVER.md`
- Voz: Kokoro / Piper / Supertonic; sanitizeForSpeech; pack errors humanizados; playback tick
- Billing TEST: checkout + webhook + idempotência; founder plans → `caronte` / `orbita_livre`

---

## Checklist V1 (objetivo)

### Operação

- [x] Confirmar no Neon: migrations **0004–0010** (0005 skip deliberado)
- [ ] Neon: aplicar **0011_write_gates** + **0012_stripe_billing** + **0015_user_preferences** se ainda pendente
- [ ] Vercel env modelos: `MODEL_PROVIDER`, `MODEL_API_KEY` ou `XAI_API_KEY`, opcional `MODEL_NAME`, `MODEL_BASE_URL`
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
- [ ] Central de ajuda: FAQ + bot (sem genérico)

### Explicitamente fora do V1

- Execução durable (Inngest / filas longas)
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
MODEL_PROVIDER=xai
MODEL_API_KEY=
MODEL_NAME=grok-4.6
MODEL_BASE_URL=https://api.x.ai/v1
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
```

Guia conectores: **`docs/CONECTORES_M5.md`**. MCP: **`docs/MCP_SERVER.md`**.
