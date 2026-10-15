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
| **H3 — Sanitização central de segredos** | **IMPLEMENTED** (2026-10-07) | `lib/security/sanitize.ts` aplicado em trace do chat, evidência de missão, `audit_events`, erro para o cliente (com `ref` de correlação) e títulos de conversa. |
| **H9 — Registro de capacidades** | **IMPLEMENTED** (2026-10-07) | `lib/capabilities/registry.ts` como fonte de verdade; `evaluateCapability`/`evaluateInternalTool` fail-closed; `assertRegistryCoverage()` contra manifestos; `docs/CAPABILITIES.md` gerado e verificado em teste de drift. |
| **X1 — Anti-loop de agente (autorizado pelo fundador)** | **IMPLEMENTED** (2026-10-07) | `MAX_TOTAL_ITERATIONS=60` acumulado no checkpoint, teto de 240 s por request, detecção de tool repetida e de output idêntico. Fecha o risco de queima de tokens entre retomadas. |
| **H8 — Isolamento de sandbox por usuário** | **IMPLEMENTED** (2026-10-07) | Namespace `userId__executionId` (fim do `default` compartilhado); resolução de caminho sem mutação de env global; proteção de escape por symlink. |
| **H5 — Rate limit MCP em todas as tools** | **IMPLEMENTED** (2026-10-07) | `withMcpGuards` cobre as 5 tools; bloqueio auditado como `rate_limited`. |
| **H6 — Export HTML sanitizado** | **IMPLEMENTED** (2026-10-07) | Allowlist de tags/atributos em `lib/security/htmlSanitize.ts`; `<script>`, `on*` e `javascript:` neutralizados. |
| **X2 — Identidade do agente aplicada (autorizado pelo fundador)** | **IMPLEMENTED** (2026-10-07) | Perfil de Configurações > Agente (`name`/`identity`/`personality`) era carregado e descartado no chat; o MCP usava persona hardcoded diferente. Agora `lib/agente/identity.ts` alimenta chat e MCP com a mesma identidade e os mesmos princípios operacionais. Default permanece idêntico a `NIX_IDENTITY`. |
| **H4 — Filtros Supabase validados** | **IMPLEMENTED** (2026-10-07) | `lib/connectors/supabaseFilters.ts`: operadores em allowlist, parâmetros reservados recusados, `select` e tabela validados. |
| **Modelos GGUF locais no APK (vitrine + chat)** | **IMPLEMENTED — uso em device parcial** (2026-10-15, PRs #152–#155) | Download/import SAF para `files/models/`; plugin Capacitor `LocalModelPlugin`; motor nativo **llama.cpp** (submodule `apps/android/native/cpp/vendor/llama.cpp`); CI **Android Debug** verde com artifact `plutao-debug-apk` (ABI `arm64-v8a`/`x86_64`). Chat local: prompt ChatML (Qwen Instruct), stop EOG/`<|im_end|>`, maxTokens default 96, `n_threads≤4`, sampler top_k/top_p/temp, throttle de stream, cancelamento. **Pendente:** polimento de qualidade/calor no device; preload ao selecionar modelo; smoke formal de unload/troca de modelo. Browser puro **não** executa GGUF (orientação para APK). |
| **Chat — timeline de cards de ferramenta + anti-missão fantasma** | **IMPLEMENTED** (2026-10-13, PRs #148–#151) | Respostas progressivas com cards de ferramenta na ordem de execução; gate `isExplicitMissionRequest` evita plano de missão em perguntas analíticas; strip de JSON de tool inventado no texto; tool-first para análise/crescimento de repositório GitHub. **Pendente:** smoke formal em produção e fallback de modelo cloud em 429 (fila futura). |
| **Worker durável de missões** | **IMPLEMENTED — probe verificado; cadência/execução real não verificada** | `POST /api/missions/:id/autonomous-run` enfileira execution/job e o worker deriva o status terminal da execution persistida. Health probe passou; smoke serial ainda sem execution `COMPLETED`. |
| **Entrada única + grafo versionado V2 serial** | **IMPLEMENTED — intake/configuração parcialmente verificados; execução serial pendente** | Intake, replay, ownership básico verificados; enqueue cria job, mas timeout/cancel sem checkpoint de nó. Write Gate, DoD/evidence por nó e paralelismo seguem sem evidência completa. |
| Preferência de modelo server-side + resiliência a rate limit | **IMPLEMENTED** (2026-10-03) | `preferredModel` em preferences; retry com backoff/`Retry-After`. Smoke produção pendente. |
| GitHub Files Write / GitHub Pro | **VERIFICADO / IMPLEMENTED** | Write gate; trees API; branches/PRs/search/tree. Smoke branch→PR em produção pendente. |
| Exportação de arquivos (`files.export_*`) | **VERIFICADO** | PDF/XLSX/MD/HTML no filesystem pessoal. |
| Voz on-device (Kokoro + Piper + Supertonic) | **VERIFICADO comportamental** | Packs e retomada; kill-tests M3/M5 pendentes. |
| Identidade do Agente (Nix) | **VERIFICADO** | `lib/agente/identity.ts` no chat e MCP. |
| Chat Núcleo + tools GitHub/Vercel | **VERIFICADO** | Produção com OAuth real. |
| Conectores (GitHub, Vercel, Neon, Stripe, Supabase, Telegram, Cloudflare, Render) | **IMPLEMENTED** (smokes variados) | Ver matriz legada e `docs/CAPABILITIES.md`. |
| MCP fase 2 | **VERIFICADO** (2026-09-27) | Consent dual, audit, rate limit, persistência. |
| Billing Stripe | **IMPLEMENTED** — TEST 6/6; LIVE pendente | |
| H2 — DoD sem bypass `force` | **IMPLEMENTED** | Status `INCONCLUSIVE` sem evidência. |
| PWA / APK debug | **IMPLEMENTED (debug)** / lojas **PLANEJADO** | APK debug via `android-debug.yml` + Capacitor; artifact em Actions. Lojas após V1 web estável. |
| TypeScript monorepo | **ALIGNED** | Root + workspaces. |

---

## Atualização 2026-10-15 (código em `main`, docs)

- **Chat:** timeline com cards de ferramenta em ordem; anti-plano automático em queries não-missão; análise de repositório tool-first (GitHub).
- **APK / modelos locais:** GGUF on-device via llama.cpp oficial; vitrine Baixar no Plutão + Importar de Transferências; seletor Local no chat; ChatML + stop tokens + stream com throttle (PRs #152–#155). Android Debug em `main` com artifact baixável.
- **Não muda nesta data:** piloto serial de missão (execution `COMPLETED`), feedback de write-gate no chat, billing LIVE, smokes formais de worker — permanecem a prioridade de fechamento do V1 operacional.

## O que o código já faz (sem inventar)

- Auth email/senha, guest mode, login social (código); conversas/mensagens no servidor
- Conectores com tokens cifrados, write gate server-side, registry fail-closed
- Chat com tools de conectores, identidade Nix configurável, export de arquivos
- Mission workspace + worker durável enfileirado (execução serial de nó ainda não verificada ponta a ponta)
- APK Android com modelos GGUF locais (llama.cpp), vitrine e chat local
- Hardening H1–H9 / X1–X2 no código (smoke Vercel completo ainda recomendado)

## Prioridades de fechamento do V1 operacional

- [ ] Runtime serial: job → claim → nó → execution `COMPLETED` / job `SUCCEEDED`
- [ ] Feedback de write-gate no chat
- [ ] Smoke worker + missão formal (plano → tool → evidência)
- [ ] Billing LIVE; smokes GitHub Pro / conectores pendentes
- [ ] Polimento GGUF local (preload, calor, unload) — fila secundária
- [ ] Fallback de modelo cloud em 429 — fila secundária

### Explicitamente fora do V1

- Adapter de execução gerenciado (Inngest etc.)
- Publicação do APK em lojas de app (o APK debug já existe no CI)
- Modelo próprio treinado
- Wave C completa (Linear, Notion, Sentry, …)
- Browser Capability / Tool Broker / engines de permissão e evidência como módulos independentes

---

Guia conectores: **`docs/CONECTORES_M5.md`**. MCP: **`docs/MCP_SERVER.md`**.
