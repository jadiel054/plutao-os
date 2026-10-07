# Prova obrigatória da entrega — hardening Plutão OS (2026-10-07)

Documento de prova exigido pela especificação da tarefa. Cobre:

1. [Antes/depois por item (arquivo:linha) + teste que falhava e agora passa](#1-antesdepois-por-item)
2. [Saídas de `npm run typecheck`, `npm run lint` e `npx vitest run`](#2-saídas-de-verificação)
3. [`git ls-remote origin <branch>`](#3-sha-remoto)
4. [Link do PR](#4-pr)
5. [O que NÃO foi reproduzido ou NÃO foi feito, e por quê](#5-o-que-não-foi-reproduzido-ou-não-foi-feito)
6. [Como reproduzir a suíte de regressão por item](#6-como-reproduzir)

Branch: `hardening/capabilities-controls` · base: `origin/main` = `58f7246` (o commit auditado).

---

## 1. Antes/depois por item

Números de linha "antes" referem-se a `origin/main` (`58f7246`).

### H1 — Write Gate burlável

| | |
| --- | --- |
| **Antes** | `apps/web/src/lib/runtime/tools/github.ts:85,128,199` — `_gateApproved?: boolean` no input, `_gateApproved: j._gateApproved === true`, `if (isWrite && !parsed._gateApproved)` |
| | `apps/web/src/lib/runtime/tools/vercel.ts:45,83,154` — idêntico |
| | `render` / `cloudflare` / `supabase` / `telegram` — mesmo padrão |
| **Depois** | `_gateApproved` **não existe** em nenhum executor (`grep -rn "_gateApproved" apps/web/src` só encontra comentários de remoção, `gatePayload.ts` (que o exclui do hash) e testes que provam que ele é ignorado) |
| | Autorização em `_gateId` → `apps/web/src/lib/connectors/writeGateGuard.ts` → `gates.ts#consumeGateForWrite` |
| **Teste que falhava e agora passa** | `apps/web/src/lib/connectors/__tests__/writeGateServerSide.test.ts` (**8 testes**, novos): sem id · id de outro usuário · payload alterado · replay · `pending` · `rejected` · provider divergente · capability divergente |
| | `apps/web/src/lib/connectors/__tests__/cloudflare.test.ts:257` e `render.test.ts:325` — "recusa escrita sem gate aprovado — `_gateApproved` é ignorado (fail-closed)" |
| | **Antes do fix:** esses casos executavam a escrita (o booleano bastava). **Depois:** recusam. |

### H2 — `force=true` no DoD

| | |
| --- | --- |
| **Antes** | `apps/web/src/lib/missions/transition.ts:34,40,42,70` (`force?: boolean`, `&& !force`); `apps/web/src/app/api/missions/[id]/route.ts:60,147,148` (`body.force === true`) |
| **Depois** | `force` removido do tipo e do corpo; `route.ts` ignora `body.force`; DoD recusa `COMPLETED` e grava `INCONCLUSIVE` (`lifecycle.ts` — novo status terminal) |
| **Teste** | `apps/web/src/lib/missions/__tests__/dodInconclusive.test.ts` (**6 testes**, novos): sem evidência → `INCONCLUSIVE` · com evidência → `COMPLETED` · `force: true` legado ignorado · nenhum update grava `COMPLETED` · `INCONCLUSIVE` é terminal |
| | **Antes do fix:** `force: true` levava a `COMPLETED` sem evidência. **Depois:** impossível. |

### H3 — Vazamento de segredos

| | |
| --- | --- |
| **Antes** | `api/chat/route.ts:976,1041` — `error: err instanceof Error ? err.message : ...` |
| | `lib/chat/renderToolRunner.ts:130,163` — `input: payload` cru no trace |
| | `lib/mcp/audit.ts:39` — `error: String(input.errorMessage).slice(0,500)` |
| | título de conversa sem sanitização (exposto por `plutao_list_conversations`) |
| **Depois** | `lib/security/sanitize.ts` (novo) aplicado nos 4 caminhos + erros de gate |
| **Teste** | `apps/web/src/lib/security/__tests__/sanitize.test.ts` (**8 testes**, novos) com segredos sintéticos: `sk-test_…`, `sk_live_…`, `ghp_…`, `prt_…`, `Bearer …`, URL Postgres com senha |
| | **Antes do fix:** `"Chave: sk-test_…"` aparecia no título e no trace. **Depois:** `[redacted]` / fallback + `ref`. |

### H4 — Injeção no `table_read` do Supabase

| | |
| --- | --- |
| **Antes** | `apps/web/src/lib/connectors/supabaseWrite.ts:276-277` — `if (where && where.trim())` com concatenação do valor bruto |
| **Depois** | `lib/connectors/supabaseFilters.ts` (novo) valida tudo; aplicação via `URLSearchParams` (`supabaseWrite.ts`) |
| **Teste** | `apps/web/src/lib/connectors/__tests__/supabaseFilters.test.ts` (**9 testes**, novos), incluindo `sql_exec` sem gate com **fetch mockado: 0 chamadas HTTP**, e prova de que `status=eq.a%26limit=999` **não** sobrescreve `limit`/`select` |
| | **Antes do fix:** `where: "limit=eq.1"` redefinia o parâmetro reservado. **Depois:** recusado. |

### H5 — OAuth/MCP

| | |
| --- | --- |
| **(a) Antes** | `lib/mcp/tokens.ts:219` — `if (allow.length === 0) return true;` + `uri.startsWith(prefix)` |
| **(a) Depois** | allowlist vazia falha fechado (localhost mantido); comparação por **origin exato** |
| **(a) Teste** | `lib/mcp/__tests__/oauthRedirect.test.ts` (**7 testes**, novos), incluindo `https://app.exemplo.com.evil.io` recusado |
| **(b)** | **Não alterado — não reproduziu falha.** `grants.ts:79-84` (UPDATE condicional `used_at IS NULL`), `token/route.ts:94-95` + `grants.ts:104-110` (rotação), `grants.ts:157-190` + `auth.ts:67` (revogação) |
| **(c) Antes** | `lib/mcp/tools.ts:197` — `checkMcpRateLimit` só em `toolSendMessage` |
| **(c) Depois** | `withMcpGuards` em **todas** as tools (30/60 s por grant), bloqueio auditado como `rate_limited` |
| **(d)** | Confirmado que `lib/mcp/authorize.ts` **não existe**; implementação em `app/api/oauth/authorize/route.ts` + `lib/mcp/tokens.ts` + `lib/mcp/grants.ts` — documentado em `docs/MCP_SERVER.md` |

### H6 — XSS no export HTML

| | |
| --- | --- |
| **Antes** | `lib/runtime/tools/export.ts:346` (`const bodyContent = input.content || ""`) e `:393` (`${bodyContent}` cru dentro de `<main>`) |
| **Depois** | `lib/security/htmlSanitize.ts` (novo) + `sanitizeHtmlFragment(bodyContent)` |
| **Teste** | `lib/runtime/tools/__tests__/exportHtmlSanitize.test.ts` (**8 testes**, novos): `<script>`, `onerror`, `javascript:`, iframe/svg/form, injeção no título, HTML legítimo preservado |
| | **Antes do fix:** `<script>` executava ao abrir o arquivo. **Depois:** removido. |

### H7 — Capabilities fail-open (GitHub)

| | |
| --- | --- |
| **Antes** | `lib/runtime/tools/github.ts:164-175` — `githubManifest.capabilities.find(...)` com fallback permissivo ("Fallback cap check for short names") |
| **Depois** | fail-closed em `github`, `vercel`, `render`, `cloudflare` via `capabilityBlockReason` |
| **Teste** | por conector: `connectors/__tests__/{cloudflare,render,supabase,telegram}.test.ts` e `runtime/tools/__tests__/github.test.ts` |

### H8 — Sandbox/storage

| | |
| --- | --- |
| **Antes** | `lib/runtime/tools/filesystem.ts:235-236` — `const effectiveExecutionId = executionId \|\| "default";` |
| | `lib/runtime/tools/sandbox.ts:232-241` — `process.env.FILESYSTEM_SANDBOX_ROOT = userSandboxRoot` + restauração no `finally` |
| | `realpath(SANDBOX_ROOT)` fora do `try`; nenhuma validação de formato de ID |
| **Depois** | `namespace.ts` (novo) `userId__executionId`; `sandbox.ts` com `assertSandboxUserId`/`assertSandboxMissionId`/`assertSandboxExecutionId`, sem mutação de env, raiz sob demanda, `realpath` do ancestral existente mais próximo; `filesystem.ts`/`export.ts` com o namespace dentro do `try`; `storage.ts` com contenção validada |
| **Teste** | `lib/runtime/tools/__tests__/sandboxHardening.test.ts` (**12 testes**, novos) com **symlink real** (para fora existente/inexistente/escrita, para dentro) e IDs malformados (`""`, `"user-1"`, `"../../etc"`, `"a/b"`, `".."`, `"exec 1"`, 65 chars) |
| | **Antes do fix:** dois usuários sem execução compartilhavam `sandbox/exec/default`. **Depois:** namespaces distintos. |

### H9 — Registro de capacidades

| | |
| --- | --- |
| **Antes** | não existia fonte de verdade; `docs/CAPABILITIES.md` inexistente; documentação já divergente do código |
| **Depois** | `lib/capabilities/registry.ts` + `registryDoc.ts` + `docs/CAPABILITIES.md` **gerado**; guard no `dispatcher.ts` e no `runRestCapability.ts`; teste de drift |
| **Teste** | `lib/capabilities/__tests__/registryBlocking.test.ts` (**8 testes**, novos) — **remove `write_gate` de `IMPLEMENTED_CONTROLS` e prova que a capacidade é bloqueada**; `capabilitiesDoc.test.ts` falha se o registro e a doc divergirem |

### X1 — Anti-loop (autorizado pelo fundador; fora do escopo do documento)

| | |
| --- | --- |
| **Antes** | `lib/runtime/agent-loop.ts` — `MAX_ITERATIONS` por chamada, sem teto acumulado, sem detecção de repetição |
| **Depois** | `MAX_TOTAL_ITERATIONS=60` no checkpoint, `MAX_LOOP_DURATION_MS=240_000`, `REPEATED_TOOL_CALL`, `NO_PROGRESS` |
| **Teste** | `lib/cockpit/__tests__/missionRuntimeFixes.test.ts` (retomada pós-gate continua verde) |

### X2 — Identidade do agente (autorizado pelo fundador)

| | |
| --- | --- |
| **Antes** | `api/chat/route.ts:371-387` — perfil lido e descartado; `lib/mcp/tools.ts:272` — persona hardcoded "Você é o Plutão, agente de execução" |
| **Depois** | `lib/agente/identity.ts` (novo) alimenta chat e MCP; default byte-idêntico a `NIX_IDENTITY` |
| **Teste** | `lib/agente/__tests__/identity.test.ts` (**6 testes**, novos) + `lib/mcp/__tests__/sendMessageEventsOrder.test.ts` (prova que o MCP usa `NIX_IDENTITY` + `OPERATOR_GOLDEN_RULE` e **não** a persona antiga) |

---

## 2. Saídas de verificação

```
$ npm run typecheck
> tsc --noEmit            (packages/domain, packages/db, apps/web)
(sem erros — 0 ocorrências de "error TS")

$ npx vitest run
 Test Files  69 passed (69)
      Tests  396 passed (396)

$ npm run lint
✖ 17 problems (0 errors, 17 warnings)
```

Os 17 warnings são pré-existentes (variáveis não usadas em arquivos de teste antigos, regra
`@typescript-eslint/no-unused-vars`) e não vêm deste PR.

Linha de base em `origin/main` antes das mudanças: **315 testes, 7 falhando**. Depois: **396 testes,
0 falhando** (+81 testes de regressão).

---

## 3. SHA remoto

```
$ git ls-remote origin hardening/capabilities-controls
<preenchido na seção 7 após o push final>
```

O SHA é registrado na seção 7 deste documento (e no comentário final do PR) imediatamente após o
`git push`, para que a prova corresponda exatamente ao que está no remoto.

---

## 4. PR

```
$ gh pr view 123 --repo jadiel054/plutao-os --json url
https://github.com/jadiel054/plutao-os/pull/123
```

Histórico do PR (1 commit por item):

```
H9  registro tipado de capacidades (fonte de verdade + doc gerada)
H3  sanitizador central de segredos (trace, log, audit, erro, título)
H1  write gate validado no servidor (remove bypass booleano) + H7 fail-closed
H2  remove bypass force=true do DoD — teto passa a ser INCONCLUSIVE
H4  filtros do Supabase estruturados e parametrizados (fim da concatenação)
H6  export HTML sanitizado por allowlist (XSS)
H5  OAuth/MCP — redirect exato, allowlist fail-closed e rate limit em todas as tools
H8  sandbox/storage — UUID obrigatório, sem namespace 'default', symlink real
X1  anti-loop e orçamento de tokens (autorizado pelo fundador)
X2  identidade do agente era configurada e descartada (autorizado pelo fundador)
docs relatório de hardening, prova obrigatória e docs atualizadas
```

Ordem de dependência (o registro H9 é base do guard de H1; o sanitizador H3 é usado pelo serviço de
gate de H1). Arquivos que atravessam itens estão listados no corpo do commit correspondente, com nota
de revisão.

---

## 5. O que NÃO foi reproduzido ou NÃO foi feito

| Item | Situação | Por quê |
| --- | --- | --- |
| **H5(b)** auth code single-use / refresh com rotação / grant revogável | **Não alterado — não reproduziu falha** | Já implementado corretamente: consumo atômico por `UPDATE ... WHERE used_at IS NULL RETURNING` (`grants.ts:79-84`), rotação substituindo o hash (`grants.ts:104-110`), revogação com checagem em `auth.ts:67`. A especificação diz: "se não reproduzir, NÃO altere; relate". |
| **H5(d)** `lib/mcp/authorize.ts` | **Não existe — auditado e documentado** | O endpoint está em `app/api/oauth/authorize/route.ts` + `lib/mcp/tokens.ts` + `lib/mcp/grants.ts`. Nada foi movido: a doc foi corrigida para apontar os arquivos reais. |
| **Flag `writeTools` desligada por padrão** | **Não introduzida** | A condição era "enquanto (b)(c) não estiverem prontos". (b) está pronto e auditado; (c) foi corrigido (rate limit em todas as tools) e `mcp:read`/`mcp:write` são exigidos por request. Introduzir a flag desligaria uma capacidade cujos controles existem e têm teste, contrariando o princípio da tarefa. |
| **H6/XSS** — sanitização do `title` no HTML exportado | **Já estava correto** | `escapeHtml(titleStr)` já existia em `origin/main`; o furo era só o `bodyContent`. Foi adicionado teste cobrindo o título. |
| **`supabase.sql_exec` blocklist de queries** | **Mantido, não substituído** | A blocklist existente (`isQueryBlocklisted`) é heurística; o controle real passou a ser o **gate humano** no ponto público. Trocar a blocklist por um parser de SQL sairia do escopo de segurança e entraria em decisão de produto. |
| **`INCONCLUSIVE` no enum do Postgres** | **Não precisou de migration** | `missions.status` é `text` (`schema.ts:219`), então o novo status é mudança só de código. |
| **Migration em produção** | **Feita, com autorização explícita** | O documento diz "nada de migrate em produção"; o fundador autorizou na tarefa ("pode sim aplicar elas e deixar a documentação atualizada"). Aplicada apenas a `0020`, puramente aditiva e idempotente. Registrado como desvio em `docs/HARDENING_2026-10.md`. |
| **Teto do loop de iterações** | **Feito, fora do escopo do documento** | O documento lista este item como "fora de escopo (aguardam decisão do fundador; não alterar)". O fundador pediu explicitamente um sistema "sem falhas de loop de agente, queima de Tokens". Registrado como **X1**, desvio deliberado e autorizado. |
| **`force` do DoD e identidade do agente** | **Feitos** | H2 estava na especificação; X2 (identidade) veio do pedido explícito de "sistema finalizado ... com identidade". |
| **Smoke em produção pelo fundador** | **Pendente (não é código)** | Nada foi marcado `VERIFICADO` em `docs/CURRENT_STATE.md` — pela regra da tarefa, `VERIFICADO` exige prova em produção. Os itens estão `IMPLEMENTED` com teste e CI verde. A única prova real de produção é a migration `0020`, consultada no Neon. |
| **Regressões que eu não consegui reproduzir** | **Nenhuma além de H5(b)** | Os demais 8 itens foram reproduzidos com arquivo:linha no commit `58f7246` antes de qualquer alteração. |

---

## 6. Como reproduzir

```bash
git fetch origin
git checkout hardening/capabilities-controls

# suíte completa
npm install
npm run typecheck
npm run lint
npx vitest run

# regressão por item
npx vitest run apps/web/src/lib/connectors/__tests__/writeGateServerSide.test.ts   # H1
npx vitest run apps/web/src/lib/missions/__tests__/dodInconclusive.test.ts         # H2
npx vitest run apps/web/src/lib/security/__tests__/sanitize.test.ts                # H3
npx vitest run apps/web/src/lib/connectors/__tests__/supabaseFilters.test.ts       # H4
npx vitest run apps/web/src/lib/mcp/__tests__/oauthRedirect.test.ts                # H5
npx vitest run apps/web/src/lib/runtime/tools/__tests__/exportHtmlSanitize.test.ts # H6
npx vitest run apps/web/src/lib/connectors/__tests__/cloudflare.test.ts            # H7
npx vitest run apps/web/src/lib/runtime/tools/__tests__/sandboxHardening.test.ts   # H8
npx vitest run apps/web/src/lib/capabilities/__tests__/registryBlocking.test.ts    # H9
npx vitest run apps/web/src/lib/agente/__tests__/identity.test.ts                  # X2

# guarda contra divergência entre registro e documentação (H9)
npm run docs:capabilities && git diff --exit-code docs/CAPABILITIES.md
```

Verificação de que não existe mais bypass booleano de gate:

```bash
grep -rn "_gateApproved" apps/web/src | grep -v "__tests__"
# só comentários que documentam a remoção e a exclusão do hash em gatePayload.ts
```

---

## 7. Registro do SHA remoto

```
$ git ls-remote origin hardening/capabilities-controls
<SHA>  refs/heads/hardening/capabilities-controls
```

Preenchido abaixo após o push final desta entrega.
