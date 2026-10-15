# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-10-15 (docs sincronizados com `main` pós PRs #148–#155: chat tool-first, timeline de cards de ferramenta, APK com GGUF on-device; piloto serial de missão e smokes de produção seguem pendentes)

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
| **H2 — DoD sem bypass `force`** | **IMPLEMENTED** (2026-10-07) | `force` removido de `transition.ts` e ignorado na rota; novo status terminal `INCONCLUSIVE`; sem evidência o teto nunca é `COMPLETED`. Teste: `dodInconclusive.test.ts`. |
| **H3 — Sanitização central de segredos** | **IMPLEMENTED** (2026-10-07) | `lib/security/sanitize.ts` aplicado em trace do chat, evidência de missão, `audit_events`, erro para o cliente (com `ref` de correlação) e títulos de conversa. |
| **H4 — Filtros Supabase validados** | **IMPLEMENTED** (2026-10-07) | `lib/connectors/supabaseFilters.ts`: operadores em allowlist, parâmetros reservados recusados, `select` e tabela validados. |
| **H5 — Rate limit MCP em todas as tools** | **IMPLEMENTED** (2026-10-07) | `withMcpGuards` cobre as 5 tools; bloqueio auditado como `rate_limited`. |
| **H6 — Export HTML sanitizado** | **IMPLEMENTED** (2026-10-07) | Allowlist de tags/atributos em `lib/security/htmlSanitize.ts`; `<script>`, `on*` e `javascript:` neutralizados. |
| **H7 — Capabilities fail-closed** | **IMPLEMENTED** (2026-10-07) | Fallback permissivo do GitHub removido; capability ausente = negado em todos os conectores, via `capabilityBlockReason`. Testes por conector. |
| **H8 — Isolamento de sandbox por usuário** | **IMPLEMENTED** (2026-10-07) | Namespace `userId__executionId` (fim do `default` compartilhado); resolução de caminho sem mutação de env global; proteção de escape por symlink. |
| **H9 — Registro de capacidades** | **IMPLEMENTED** (2026-10-07) | `lib/capabilities/registry.ts` como fonte de verdade; `evaluateCapability`/`evaluateInternalTool` fail-closed; `assertRegistryCoverage()` contra manifestos; `docs/CAPABILITIES.md` gerado e verificado em teste de drift. |
| **X1 — Anti-loop de agente (autorizado pelo fundador)** | **IMPLEMENTED** (2026-10-07) | `MAX_TOTAL_ITERATIONS=60` acumulado no checkpoint, teto de 240 s por request, detecção de tool repetida e de output idêntico. Fecha o risco de queima de tokens entre retomadas. |
| **X2 — Identidade do agente aplicada (autorizado pelo fundador)** | **IMPLEMENTED** (2026-10-07) | Perfil de Configurações > Agente (`name`/`identity`/`personality`) era carregado e descartado no chat; o MCP usava persona hardcoded diferente. Agora `lib/agente/identity.ts` alimenta chat e MCP com a mesma identidade e os mesmos princípios operacionais. Default permanece idêntico a `NIX_IDENTITY`. |
| **Hardening de escrita no chat (Bugs 1, 2 e 3)** | **VERIFICADO** (2026-10-03) | **BUG 1:** Captura e tratamento de erros no pipeline tool -> write gate. **BUG 2:** Validação de nome do projeto Vercel. **BUG 3:** Label amigável em `/api/model/status` e Cockpit. |
| **Fix & Hardening Runtime de Missões (#109+#110+#111)** | **IMPLEMENTED** (2026-10-03) | Catch FASE 3 grava evidência `model_error`; `maxDuration = 300` no resume pós-gate; sanitização de payload no boundary de `client.ts`. **Pendente:** smoke formal em produção de missão completa. |
| **Worker durável de missões** | **IMPLEMENTED — probe verificado; cadência/execução real não verificada** | `POST /api/missions/:id/autonomous-run` enfileira execution/job; workflow `runtime_worker.yml` (cron `*/2`). Health probe OK. Smoke serial ainda sem execution `COMPLETED` (timeout/cancel sem checkpoint de nó). |
| **Entrada única + grafo versionado V2 serial** | **IMPLEMENTED — intake/configuração parcialmente verificados; execução serial pendente** | Intake, replay deduplicado, conflito `409`, ownership básico verificados. Enqueue cria job; Write Gate, DoD/evidence por nó e paralelismo sem evidência completa. |
| **Preferência de modelo server-side + Resiliência a Rate Limit (#112)** | **IMPLEMENTED** (2026-10-03) | `preferredModel` em preferences; retry com backoff/`Retry-After`. Smoke produção pendente. |
| **Modelos GGUF locais no APK (vitrine + chat)** | **IMPLEMENTED — uso em device parcial** (2026-10-15, PRs #152–#155) | Download/import SAF; `LocalModelPlugin`; llama.cpp oficial (submodule); CI Android Debug verde + artifact `plutao-debug-apk` (arm64-v8a/x86_64). ChatML Qwen, stop EOG/`<|im_end|>`, maxTokens 96, `n_threads≤4`, sampler top_k/top_p/temp, throttle, cancel. **Pendente:** polimento device; preload; unload smoke. Browser não executa GGUF. |
| **Chat — timeline de cards de ferramenta + anti-missão fantasma** | **IMPLEMENTED** (2026-10-13, PRs #148–#151) | Cards de ferramenta na ordem de execução; `isExplicitMissionRequest`; strip de JSON inventado; tool-first para análise de repo GitHub. **Pendente:** smoke produção; fallback cloud em 429. |
| **Hardening de Fallback de Erro no ConnectorRuntime** | **VERIFICADO** (2026-10-03) | Catch retorna `executed: false` sem tool_start pendente. |
| **GitHub Files Write (`github.files.write`)** | **VERIFICADO** (2026-10-03) | Git Trees API; write gate; limites e path traversal. |
| **GitHub Pro (Branches, PRs, Code Search & Tree)** | **IMPLEMENTED** (2026-10-03) | Escritas sob Write Gate. Smoke branch/PR produção pendente. |
| **Exportação de arquivos (`files.export_*`)** | **VERIFICADO** (2026-10-03) | PDF/XLSX/MD/HTML no filesystem pessoal. |
| **Voz on-device (Kokoro + Piper + Supertonic)** | **VERIFICADO comportamental** (2026-09-27) | Packs e retomada; kill-tests M3/M5 pendentes. |
| B1. Login social (Google/GitHub) + Magic Link | **IMPLEMENTED** | Código + migrations; smoke depende de `AUTH_*` + Resend. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Identidade do Agente (Nix) | **VERIFICADO** (2026-10-07) | `lib/agente/identity.ts` no chat e MCP. |
| Chat Núcleo + system prompt | **VERIFICADO** | Produção. |
| Chat — awareness de conectores / tools GitHub / Vercel | **VERIFICADO** | OAuth real. |
| Chat — FollowUpChips / fila / esclarecimento pré-tool | **IMPLEMENTED** | |
| Card inline Conectar/Pular | **IMPLEMENTED** | |
| Extrator de plano (anti falso-positivo) | **IMPLEMENTED** | |
| Conectores UI (Sheet + Configurações) | **IMPLEMENTED** | |
| GitHub OAuth App + callback | **VERIFICADO** | |
| Vercel conector | **VERIFICADO** | |
| Neon / Stripe / Supabase / Telegram / Cloudflare / Render | **IMPLEMENTED** (smokes variados) | Ver `docs/CAPABILITIES.md`. |
| **MCP fase 2** | **VERIFICADO** (2026-09-27) | Consent dual, audit, rate limit, persistência. |
| Model resolve / test + fallback UI | **IMPLEMENTED** | |
| Navigation `/planos` + founder pricing | **VERIFICADO** | |
| **UX de Configurações & Conectores** | **VERIFICADO** (2026-10-03) | Tabs URL/localStorage; OAuth feedback; modal desconectar. |
| Tour guiado com spotlight | **VERIFICADO** (2026-10-03) | |
| Billing Stripe (checkout/webhook) | **IMPLEMENTED** — TEST **6/6**; LIVE pendente | Migration 0012. |
| B2. Ações por conversa | **IMPLEMENTED** | |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Bot de ajuda pendente. |
| Auditor workflow | **IMPLEMENTED** | |
| Migrations Neon produção | **IMPLEMENTED** (2026-10-07) | 0000–0020+ aplicadas. |
| Smoke M5 formal (missão + tool + evidência) | **PARCIAL** | Tools no chat OK; trilha formal a formalizar. |
| Durable execution gerenciado (Inngest etc.) | **DESIGNED** | Worker local `runtime_jobs` é o fechamento atual. |
| PWA / APK debug | **IMPLEMENTED (debug)** / lojas **PLANEJADO** | `android-debug.yml` + Capacitor; lojas após V1 web. |
| TypeScript monorepo | **ALIGNED** | |

---

## Atualização 2026-10-15 (código em `main`, docs)

- **Chat:** timeline com cards de ferramenta em ordem; anti-plano automático em queries não-missão; análise de repositório tool-first (GitHub).
- **APK / modelos locais:** GGUF on-device via llama.cpp oficial; vitrine Baixar no Plutão + Importar de Transferências; seletor Local no chat; ChatML + stop tokens + stream com throttle (PRs #152–#155). Android Debug em `main` com artifact baixável.
- **Não muda nesta data:** piloto serial de missão (execution `COMPLETED`), feedback de write-gate no chat, billing LIVE, smokes formais de worker — permanecem a prioridade de fechamento do V1 operacional.

## O que o código já faz (sem inventar)

- Botão "Explorar como convidado"; limits; persistência `conversations`/`messages`
- Estados de conector; tokens AES; tools só se conectado; write gate server-side
- Capability registry fail-closed; sandbox por usuário; sanitização central
- Chat com tools, identidade Nix, exports, MCP fase 2
- Mission workspace + worker durável enfileirado (execução serial de nó ainda não verificada ponta a ponta)
- APK Android com GGUF locais (llama.cpp), vitrine e chat local

---

## Checklist operacional (produção)

- [ ] Smoke Vercel pós-hardening H1–H9
- [ ] `MODEL_PROVIDER` / `MODEL_API_KEY` / chaves por provedor; opcional `MODEL_NAME`, `MODEL_BASE_URL`
- [ ] Vercel env Stripe LIVE (após ativação): secrets + price IDs
- [ ] Stripe Dashboard LIVE: Products founder + webhook
- [ ] Smoke modelos: chat default + teste em Configurações → Modelos
- [ ] Smoke conectores: revalidar após deploys
- [ ] Smoke GitHub Pro: branch → arquivos → PR → CI em repo de teste
- [ ] Smoke B2: pin + `/share/[token]`
- [x] Smoke guest AC3/AC4 — 2026-09-25
- [x] Smoke billing AC1–AC6 em **TEST** — 2026-09-25
- [ ] Smoke billing em **LIVE**
- [x] Smoke write gate — 2026-09-25; feedback no chat pendente
- [x] Smoke voz comportamental — 2026-09-27; kill-test M3/M5 pendentes
- [x] Smoke MCP fase 2 — 2026-09-27

### Produto (próximo ciclo — ordem de prioridade)

1. **Runtime serial:** job → claim → nó → execution `COMPLETED` / job `SUCCEEDED`
2. Feedback de write-gate no chat
3. Smoke worker + missão formal (plano → tool → evidência)
4. Billing LIVE (se for lançar); smokes GitHub Pro / conectores pendentes
5. Polimento GGUF local (preload, calor, unload) — **fila depois**
6. Fallback de modelo cloud em 429 — fila depois
7. Wave C / Browser Capability — **só após V1 fechado**
8. Central de ajuda: FAQ + bot
9. Neon conector smoke; seletor AUTO só com rota + chave

### Explicitamente fora do V1

- Adapter de execução gerenciado (Inngest etc.); o worker local de `runtime_jobs` faz parte do fechamento atual
- Publicação do APK em lojas de app (o APK debug já existe no CI)
- Modelo próprio treinado
- Wave C completa (Linear, Notion, Sentry, …)
- Browser Capability / Tool Broker / engines de permissão e evidência como módulos independentes

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
