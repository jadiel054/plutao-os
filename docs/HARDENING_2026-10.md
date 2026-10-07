# Hardening de segurança — Plutão OS (2026-10-07)

**Escopo:** PR único de hardening de segurança no repositório `jadiel054/plutao-os`, a partir de
`origin/main` (`58f7246`), branch `hardening/capabilities-controls`.

**Princípio aplicado:** não existem "fases" de segurança. Uma capacidade só fica ligada se **todos**
os seus controles existem e têm teste. Sem controle completo, a capacidade fica desligada.

**Resultado:** os 9 itens da especificação (H1–H9) foram reproduzidos e corrigidos na raiz, mais 2
itens autorizados explicitamente pelo fundador fora do escopo do documento (X1 e X2).

| Métrica | Antes | Depois |
| --- | --- | --- |
| Testes | 315 (7 falhando) | **396 (0 falhando)** — 69 arquivos |
| Typecheck (`tsc --noEmit`) | limpo | **limpo** (3 workspaces) |
| Lint | 0 erros | **0 erros** |
| Bypass booleano de gate | 6 conectores | **0** |
| Migration 0020 | não aplicada | **aplicada e verificada no Neon de produção** |
| Commits | — | **1 por item** (H9, H3, H1+H7, H2, H4, H6, H5, H8, X1, X2, docs) |

> Prova obrigatória (antes/depois arquivo:linha, teste que falhava e passa, saídas de
> typecheck/lint/vitest, SHA remoto e o que **não** foi feito): [`docs/HARDENING_PROOF.md`](HARDENING_PROOF.md).

---

## Índice

- [H1 — Write Gate burlável](#h1)
- [H2 — `force=true` no DoD](#h2)
- [H3 — Vazamento de segredos](#h3)
- [H4 — Injeção no `table_read` do Supabase](#h4)
- [H5 — OAuth/MCP](#h5)
- [H6 — XSS no export HTML](#h6)
- [H7 — Capabilities fail-open](#h7)
- [H8 — Sandbox/storage](#h8)
- [H9 — Registro de capacidades](#h9)
- [X1 — Anti-loop de agente (autorizado pelo fundador)](#x1)
- [X2 — Identidade do agente (autorizado pelo fundador)](#x2)
- [Banco de dados](#banco-de-dados)
- [Documentação atualizada](#documentação-atualizada)

---

<a id="h1"></a>
## H1 — Write Gate burlável

**Reproduzido.** `github.ts:199` e `vercel.ts:154` (e os mesmos padrões em `render`, `cloudflare`,
`supabase`, `telegram`):

```ts
if (isWrite && !parsed._gateApproved) { /* pede aprovação */ }
```

`_gateApproved` vinha do **input do modelo**. Qualquer payload com `_gateApproved: true` — inclusive
um gerado por prompt injection a partir de conteúdo externo (README, issue, resposta de API) —
executava a escrita real **sem nenhum gate aprovado por humano**. O Princípio 1 do produto era, na
prática, opcional. Os helpers `githubWrite`/`vercelWrite` também não verificavam gate localmente.

**Corrigido.**

- `apps/web/src/lib/connectors/gatePayload.ts` (novo) — canonicalização + `sha256` do payload.
- `apps/web/src/lib/connectors/writeGateGuard.ts` (novo) — guard único de escrita.
- `apps/web/src/lib/connectors/gates.ts` — ciclo `pending → approved → executing → executed | failed`
  com `approveGate`, `consumeGateForWrite`, `finalizeGateExecution`, `failUnconsumedGate`.
- `packages/db/src/schema-gates.ts` + `packages/db/drizzle/0020_hardening_write_gates.sql`.
- Executores `github`, `vercel`, `render`, `cloudflare`, `supabase`, `telegram` reescritos.
- `apps/web/src/app/api/gates/[id]/route.ts` — aprovação server-side, com `payload_hash` calculado
  a partir do payload **persistido** (o mesmo que o humano viu na tela).

**Como.** `_gateApproved` deixou de existir. A autorização é `_gateId` e o guard valida no servidor,
contra o banco: gate existe, é do **mesmo usuário**, provider e capability conferem, status
`approved`, `payload_hash` idêntico ao do payload que vai executar, e o claim é atômico e de uso
único (`UPDATE ... WHERE status='approved' AND payload_hash=...`). Sem `_gateId` válido, o executor
não escreve: devolve `GATE_PENDING`.

**Testes** (`writeGateServerSide.test.ts`, 8 casos + por conector): sem id · id de outro usuário ·
payload alterado · replay · gate `pending` · gate `rejected` · provider divergente · capability
divergente. E `cloudflare.test.ts:257` / `render.test.ts:325` provam que `_gateApproved: true` é
**ignorado** (fail-closed).

---

<a id="h2"></a>
## H2 — `force=true` no DoD liberava COMPLETED sem evidência

**Reproduzido.** `apps/web/src/lib/missions/transition.ts:70` (`&& !force`),
`apps/web/src/app/api/missions/[id]/route.ts:60` (`body.force === true`) e a documentação do
comportamento em `docs/VERIFICATION.md:82`.

**Corrigido.**

- `apps/web/src/lib/missions/transition.ts` — parâmetro `force` **removido**.
- `apps/web/src/app/api/missions/[id]/route.ts` — `body.force` **ignorado**; em vez de 409, o estado
  passa a `INCONCLUSIVE`.
- `apps/web/src/lib/missions/lifecycle.ts` — novo status terminal `INCONCLUSIVE`, alcançável a
  partir de `VERIFYING` e `CORRECTING`.

**Como.** Quando o destino é `COMPLETED`, o DoD é sempre avaliado. Se não passa, a missão **não**
fica presa em `VERIFYING` (o loop autônomo a retomaria para sempre) e **nunca** vira `COMPLETED`:
ela encerra em `INCONCLUSIVE`, com `capped: true` e o resumo do DoD no retorno.

**Por quê.** "Sem evidência, o estado máximo é INCONCLUSIVE" — o sistema precisa de um estado honesto
para "não consegui provar", em vez de um bypass manual ou de uma conclusão falsa.

**Testes** (`dodInconclusive.test.ts`): com evidência → `COMPLETED`; sem evidência → `INCONCLUSIVE`;
`force: true` legado é ignorado; nenhum update grava `COMPLETED` sem DoD.

---

<a id="h3"></a>
## H3 — Vazamento de segredos em traces, logs, erros e títulos

**Reproduzido.** Quatro canais devolviam/gravavam texto cru:

| Caminho | Antes |
| --- | --- |
| `api/chat/route.ts:976,1041` | `error: err instanceof Error ? err.message : ...` devolvia mensagem crua de provedor ao cliente |
| `lib/chat/renderToolRunner.ts:130,163` | `input: payload` ia **inteiro** no trace do SSE — o valor de `render.env_set` aparecia em claro |
| `lib/mcp/audit.ts:39` | `error: String(input.errorMessage).slice(0, 500)` gravava cru em `audit_events` |
| título de conversa | qualquer texto era aceito e exposto por `plutao_list_conversations` |

**Corrigido.** Novo `apps/web/src/lib/security/sanitize.ts` — `sanitizeText`, `sanitizeValue`
(recursivo, com chaves sensíveis extras), `sanitizeError`, `sanitizeErrorForClient` (com `ref` de
correlação), `sanitizeTitle`, `maskSecret`. Aplicado em: trace do render, evidência de missão,
`audit_events` do MCP, erro para o cliente, títulos de conversa (criação, PATCH e MCP) e mensagens
de erro de gate.

**Por quê.** Um único sanitizador no **ponto de saída** elimina a classe inteira do problema: um
caminho novo não consegue "esquecer" de mascarar.

**Testes** (`sanitize.test.ts`, 8 casos) com segredos sintéticos (`sk-test_…`, `ghp_…`, `prt_…`,
`Bearer …`, URL de Postgres com senha): nenhum aparece em trace, log, título ou resposta; o erro
para o cliente vira mensagem genérica + `ref`.

---

<a id="h4"></a>
## H4 — `supabase.table_read` concatenava `where` bruto (injeção)

**Reproduzido.** `supabaseWrite.ts:276-277`: `if (where && where.trim())` e o valor era concatenado
na query do PostgREST. `where: "limit=eq.1"` redefinia um parâmetro reservado; `or`/`and` permitiam
compor lógica arbitrária; o filtro declarado podia ser anulado. `select` só passava por heurística
de substring e o nome da tabela não era validado.

**Corrigido.**

- `apps/web/src/lib/connectors/supabaseFilters.ts` (novo) — `validateTableName`, `validateSelect`,
  `parseTableFilters`: allowlist de operadores, coluna precisa ser identificador, parâmetros
  reservados (`select`, `limit`, `order`, `or`, `and`, `offset`, `on_conflict`, …) **recusados**,
  limites de quantidade e tamanho.
- `supabaseWrite.ts` — filtros validados e aplicados via `URLSearchParams` (parametrizado, nunca
  concatenado); `sql_exec` exige gate no ponto público.

**Por quê.** O chamador não pode reescrever a consulta que declarou. Filtro é estrutura validada, não
string.

**Testes** (`supabaseFilters.test.ts`): parâmetros reservados, operador fora da allowlist, coluna
inválida, `select` inválido, **`sql_exec` sem gate não faz nenhum HTTP** (fetch mockado com
contador), `_gateApproved` ignorado, e um teste que prova que o valor do filtro (`a%26limit=999`)
**não** sobrescreve os parâmetros reservados `limit`/`select`.

---

<a id="h5"></a>
## H5 — OAuth/MCP

### (a) Redirect — **reproduzido e corrigido**

`tokens.ts:219` (`origin/main`):

```ts
if (allow.length === 0) return true;                                  // fail-OPEN
return allow.some((prefix) => uri === prefix || uri.startsWith(prefix)); // prefixo, não origin
```

Allowlist vazia liberava **qualquer** https; e `https://app.exemplo.com.evil.io` passava por começar
com `https://app.exemplo.com`.

**Corrigido** em `apps/web/src/lib/mcp/tokens.ts`: allowlist vazia **falha fechado** (só localhost em
http é mantido, para desenvolvimento), comparação por **origin exato** (e caminho exato quando a
entrada declara caminho), fragmento recusado.

**Testes** (`oauthRedirect.test.ts`, 7 casos): allowlist vazia + localhost · origin exato · ataque de
prefixo (`app.exemplo.com.evil.io`, `app.exemplo.com.br`) · caminho exato · `javascript:`/`data:`/`ftp:`
/`#fragmento`/string inválida · http não-localhost.

### (b) Auth code single-use, refresh com rotação, grant revogável — **auditado, já correto**

Não alterado porque **não reproduziu falha**:

- **single-use atômico** — `grants.ts:79-84` faz `UPDATE ... SET used_at WHERE jti = ? AND used_at IS NULL RETURNING`,
  ou seja, a marcação é condicional no banco (dois requests concorrentes: só um vence).
- **rotação no refresh** — `token/route.ts:94-95` gera novo `prt_*` e `attachRefreshToken` **substitui**
  o hash (`grants.ts:104-110`), invalidando o anterior.
- **revogável** — `revokeGrant` / `revokeGrantByRefreshOrAccess` (`grants.ts:157-190`) e a checagem
  `isGrantActive` no `auth.ts:67` (grant revogado ⇒ 401 imediato).

### (c) Escopos e rate limit — **reproduzido e corrigido (rate limit)**

`mcp/tools.ts` (`origin/main`): `checkMcpRateLimit` só era chamado em `toolSendMessage:197`. As 4
tools de leitura podiam ser chamadas sem limite.

**Corrigido:** `withMcpGuards` aplica **30 calls/60 s por grant em todas as tools**, e o bloqueio é
auditado com status `rate_limited`. Escopos: `mcp:read` é exigido em todo request (`auth.ts:63`) e
`mcp:write` é exigido no envio de mensagem — verificado, sem alteração necessária.

### (d) Onde o `authorize` realmente vive — **auditado e documentado**

Confirmado: **não existe** `apps/web/src/lib/mcp/authorize.ts`. O endpoint está implementado em:

| Peça | Onde |
| --- | --- |
| Authorization endpoint (validação + redirect ao consent) | `apps/web/src/app/api/oauth/authorize/route.ts` |
| Consent UI + criação do grant/code | `apps/web/src/app/oauth/consent` |
| Emissão/verificação de tokens, PKCE, allowlist de redirect | `apps/web/src/lib/mcp/tokens.ts` |
| Persistência de grants/codes, rotação e revogação | `apps/web/src/lib/mcp/grants.ts` |

`docs/MCP_SERVER.md` foi corrigido para apontar os arquivos reais.

### Flag `writeTools`

A condição do documento era "enquanto (b)(c) não estiverem prontos, `writeTools` fica desligado por
padrão". **(b) e (c) estão prontos e testados** (single-use atômico no banco, rotação, revogação,
escopos e rate limit em todas as tools), então **não** foi introduzida flag — a capacidade de escrita
do MCP permanece ligada, condicionada ao escopo `mcp:write` e ao gate humano.

---

<a id="h6"></a>
## H6 — XSS no export HTML

**Reproduzido.** `runtime/tools/export.ts:346,393` (`origin/main`):

```ts
const bodyContent = input.content || "";
...
      ${bodyContent}
```

`<script>fetch('//evil')</script>` no conteúdo virava HTML válido e **executava** quando o usuário
abrisse o arquivo exportado.

**Corrigido.** `apps/web/src/lib/security/htmlSanitize.ts` (novo) — allowlist de tags/atributos;
`script`/`style`/`iframe`/`svg`/`form`/`object`/`embed` removidos **com o conteúdo**; `on*`, `style`
e URLs com esquema não permitido (`javascript:`, `data:`, `vbscript:`) neutralizados. Aplicado em
`exportHtml` (`sanitizeHtmlFragment(bodyContent)`), com o título já escapado.

**Por quê.** O export é aberto no navegador do usuário: allowlist é a única postura defensável para
conteúdo gerado pelo modelo.

**Testes** (`exportHtmlSanitize.test.ts`, 8 casos): `<script>`, `onerror`, `javascript:`,
iframe/svg/form, injeção no título, HTML legítimo preservado, e IDs malformados recusados no runner
público.

---

<a id="h7"></a>
## H7 — Capabilities fail-open (GitHub) vs fail-closed (Vercel)

**Reproduzido.** `runtime/tools/github.ts:164` (`origin/main`):

```ts
const manifestCap = githubManifest.capabilities.find((c) => c.name === parsed.action);
// ... "Fallback cap check for short names if manifest lists full prefixed names"
```

Quando a capability não era encontrada, a execução seguia por um caminho genérico **permissivo**,
enquanto o Vercel negava. Um manifesto incompleto (ou nome de ação errado) virava permissão
implícita.

**Corrigido.** Uniformizado em `github`, `vercel`, `render`, `cloudflare`: **capability ausente =
negado**, sempre. A decisão passa por `capabilityBlockReason` (registro tipado) antes de qualquer
HTTP.

**Testes.** Por conector (`github`, `vercel`, `render`, `cloudflare`, `supabase`, `telegram`), com
assert de que `_gateApproved` é ignorado e de que capability desconhecida é recusada.

---

<a id="h8"></a>
## H8 — Sandbox/storage

**Reproduzido.** Quatro problemas:

1. `filesystem.ts:236` — `const effectiveExecutionId = executionId || "default";` → **todos** os
   usuários sem execução caíam no mesmo namespace `default` (arquivos de um visíveis para outro).
2. `sandbox.ts:232-241` — `process.env.FILESYSTEM_SANDBOX_ROOT = userSandboxRoot` e restauração no
   `finally`: corrida entre requisições concorrentes em serverless.
3. `realpath(SANDBOX_ROOT)` fora do `try` → raiz inexistente lançava e o tool devolvia
   `PERMISSION_DENIED` (falha funcional disfarçada de segurança).
4. Nenhuma validação de formato de `userId`/`missionId`/`executionId` antes de montar caminho.

**Corrigido.**

- `namespace.ts` (novo) — namespace sempre `userId__executionId`; `sandboxNamespace` **rejeita**
  (não "limpa") IDs malformados.
- `sandbox.ts` — `assertSandboxUserId` / `assertSandboxMissionId` / `assertSandboxExecutionId`
  (UUID; para `executionId` também um rótulo interno seguro, como `"chat"`, usado pelo export
  escopado no chat); sem mutação de `process.env`; `ensureSandboxRoot()` cria a raiz sob demanda; o
  **ancestral existente mais próximo** é resolvido por `realpath` e validado — bloqueia escape por
  symlink **mesmo para arquivo que ainda não existe**.
- `filesystem.ts` / `export.ts` — namespace calculado **dentro** do `try`, para que
  `SandboxSecurityError` vire código tratado (`INVALID_INPUT`) em vez de exceção crua; o `catch`
  amplo não engole mais o erro de segurança (ele é tratado **primeiro**, por `instanceof`).
- `storage.ts` — defense in depth: segmento saneado + contenção validada em `getExecutionPath`.

**Testes** (`sandboxHardening.test.ts`, 12 casos) com **symlink real**: symlink para fora (arquivo
existente, arquivo inexistente e escrita) bloqueado; symlink para dentro permitido; traversal
clássico; raiz inexistente; IDs malformados (`""`, `"user-1"`, `"../../etc"`, `"a/b"`, `".."`,
`"exec 1"`, 65 chars) rejeitados; e prova de que o namespace autenticado nunca é `default` nem
compartilhado entre usuários.

---

<a id="h9"></a>
## H9 — Registro de capacidades

**Reproduzido.** "Quais capacidades existem, quais estão ligadas e quais controles cada uma exige"
estava espalhado entre manifestos, executores e documentação — e a documentação já havia divergido
do código. Não havia fonte de verdade capaz de **recusar** execução.

**Corrigido.**

- `apps/web/src/lib/capabilities/registry.ts` (novo) — `CapabilityControl`, `IMPLEMENTED_CONTROLS`,
  `DECLARATIONS` por provedor com `enabled`, `requiredControls[]` (auth/escopo, gate, snapshot ou
  reversão, evidência, sanitização) e `evidence`; `evaluateCapability` / `capabilityBlockReason`
  (fail-closed); `assertRegistryCoverage()` contra os manifestos; `INTERNAL_TOOL_CONTROLS` /
  `evaluateInternalTool` para tools internas.
- `runtime/tools/dispatcher.ts` — tools internas passam por `evaluateInternalTool`.
- `connectors/runRestCapability.ts` — toda capability REST é validada antes do HTTP.
- `capabilities/registryDoc.ts` + `docs/CAPABILITIES.md` (gerado) + `npm run docs:capabilities`.
- Teste de **drift**: se o registro e a documentação divergirem, a suíte falha.

**Teste de aceite** (`registryBlocking.test.ts`): remove `write_gate` de `IMPLEMENTED_CONTROLS` e
prova que a capacidade de escrita passa a ser **recusada** (`evaluateCapability(...).allowed === false`),
restaurando em seguida. Nenhuma nomenclatura "Phase 1/2/3".

---

<a id="x1"></a>
## X1 — Anti-loop de agente (**autorizado pelo fundador, fora do escopo do documento**)

> O documento lista "teto do loop de iterações" como **fora de escopo** ("aguardam decisão do
> fundador; não alterar"). O fundador pediu explicitamente, na tarefa, um sistema "sem falhas de loop
> de agente, queima de Tokens", o que trouxe este item para o escopo. Registrado aqui como desvio
> deliberado e autorizado.

**Reproduzido.** `agent-loop.ts` só parava por erro de tool, `idempotent`, ausência de tool proposta
ou `MAX_ITERATIONS` (20, **por chamada**). Como a missão é retomada a cada aprovação de gate e a cada
nova chamada (`findRecoverableExecution`), o total de iterações entre requests era ilimitado — o
"loop de agente / queima de tokens".

**Corrigido** (`agent-loop.ts`, `types.ts`): `MAX_TOTAL_ITERATIONS = 60` **acumulado no checkpoint**
entre retomadas; `MAX_LOOP_DURATION_MS = 240_000` verificado a cada iteração (margem sobre os 300 s
da plataforma); assinatura `tool::input` repetida → `REPEATED_TOOL_CALL`; output idêntico duas vezes
seguidas → `NO_PROGRESS`. Parada suave devolve o controle ao DoD; estouro de orçamento falha limpo
(sem execução pendurada em `RUNNING`).

---

<a id="x2"></a>
## X2 — Identidade do agente era configurada e descartada (**autorizado pelo fundador**)

**Reproduzido.** `api/chat/route.ts:371-387` (`origin/main`) lia `agents.name`, `agents.identity` e
`agents.personality` a cada requisição e **jogava fora**: `agentName` só aparecia numa mensagem de
fallback sem chave de API, `agentIdentity` nunca era usado e `personality` era lido e ignorado por
completo. O system prompt começava sempre com o literal `NIX_IDENTITY`. Além disso, o caminho MCP
usava persona hardcoded diferente (`"Você é o Plutão, agente de execução"`) e sem os princípios
operacionais.

**Corrigido.** Novo `apps/web/src/lib/agente/identity.ts` (`loadAgentIdentity`,
`buildIdentityLine`, `buildIdentityBlock`) alimenta chat **e** MCP com o mesmo perfil. Com o perfil
default o texto é **byte-idêntico** a `NIX_IDENTITY` (sem regressão de prompt); com perfil
customizado, `Você é <nome>, <identidade>.` + bloco `PERSONALIDADE`.

**Testes** (`identity.test.ts` + `sendMessageEventsOrder.test.ts`): default = `NIX_IDENTITY`, perfil
custom, personalidade, fallback silencioso em falha de banco, e prova de que o MCP usa a **mesma**
identidade e a regra de ouro do operador (e não a persona antiga).

---

## Banco de dados

**`0020_hardening_write_gates.sql` aplicada e verificada em produção** (projeto Neon `Plutao`,
`fragrant-boat-15398274`, São Paulo):

```sql
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "payload_hash" text;
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "consumed_at" timestamp with time zone;
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "consumed_by" text;
CREATE INDEX IF NOT EXISTS "write_gates_status_consumed_idx"
  ON "write_gates" ("status", "consumed_at");
```

**Desvio deliberado e autorizado:** o documento diz "nada de migrate em produção" e "NÃO aplique em
produção". O fundador autorizou explicitamente, na tarefa, aplicar o SQL aditivo no Neon ("pode sim
aplicar elas e deixar a documentação atualizada"). A migration é **puramente aditiva e idempotente**
(`IF NOT EXISTS`): não altera nem remove dados, e gates pendentes antigos continuam válidos — o hash
é calculado na aprovação a partir do payload já persistido. Verificado em produção: as três colunas
existem em `write_gates`.

Nenhuma outra migration foi necessária: `INCONCLUSIVE` é valor de uma coluna `text`
(`missions.status`), não de um enum do Postgres.

---

## Documentação atualizada

- `docs/HARDENING_2026-10.md` (este arquivo) — o que foi encontrado, o que foi feito, onde e por quê
- `docs/HARDENING_PROOF.md` (novo) — prova obrigatória da entrega
- `docs/CAPABILITIES.md` (novo, **gerado** do registro) — capacidades, controles e evidências
- `docs/CURRENT_STATE.md` — itens marcados **IMPLEMENTED** (com evidência), nunca `VERIFICADO`
- `docs/VERIFICATION.md` — Layer M (hardening) e correção do "Iteration Guard" (dizia ≤5; o real é
  20 por chamada + 60 acumulado por execution)
- `docs/NEON_SETUP.md` — migration 0020 aplicada + política de SQL aditivo autorizado
- `docs/MCP_SERVER.md` — rate limit em todas as tools e os arquivos reais do fluxo OAuth
