# Revisão técnica de segurança — 2026-10-07

## Escopo

A investigação foi comparada com o código atual do Plutão, testes locais e documentação versionada. O trabalho foi dividido em dois PRs pequenos:

- **PR #131 — OAuth e migrations:** https://github.com/jadiel054/plutao-os/pull/131
- **PR #130 — tenant, sandbox e ingress:** https://github.com/jadiel054/plutao-os/pull/130

Nenhum SQL foi executado no Neon e nenhum segredo foi alterado no Vercel.

## Correções confirmadas e aplicadas

### 1. OAuth redirect e PKCE — corrigido

Arquivos principais:

- `apps/web/src/lib/mcp/tokens.ts`
- `apps/web/src/app/api/oauth/authorize/route.ts`
- `apps/web/src/lib/mcp/__tests__/oauthRedirect.test.ts`
- `apps/web/src/app/api/oauth/authorize/__tests__/authorizeRoute.test.ts`
- `docs/MCP_SERVER.md`
- `.env.example`

A comparação HTTPS agora exige `URL.href` exata, incluindo origin, caminho, barra final e query. Fragmentos são recusados. O callback loopback HTTP só aceita `localhost`/`127.0.0.1` no caminho `/callback`, em qualquer porta, sem fragmento. O cliente precisa enviar `code_challenge_method=S256` explicitamente; não existe mais default silencioso.

A documentação não presume rotas de callback. Os caminhos `/api/mcp/callback` e `/api/mcp/auth_callback` não são rotas do Plutão; callbacks HTTPS próprios devem ser cadastrados como URI completa na allowlist. O fluxo autenticado de cliente externo não foi testado, pois depende de sessão autorizada.

### 2. Migrations — fail-closed e plano de baseline

Arquivos:

- `packages/db/drizzle.config.ts`
- `packages/db/package.json`
- `docs/NEON_SETUP.md`

`drizzle-kit` usa somente `DATABASE_URL_UNPOOLED`; o script `migrate` aborta se ela não estiver definida e nunca faz fallback para a URL pooled.

O plano documentado para o Neon é: inventário read-only da branch de produção; comparação de tabelas, colunas, índices e hashes com o journal; só então uma proposta de baseline do ledger, sem reexecutar SQL já refletido. Aplicação de qualquer SQL continua bloqueada até confirmação explícita.

### 3. Isolamento por tenant/IDOR — corrigido nos pontos revisados

Arquivos:

- `apps/web/src/lib/missions/ownership.ts`
- `apps/web/src/app/api/conversations/route.ts`
- `apps/web/src/app/api/conversations/[id]/route.ts`
- `apps/web/src/app/api/missions/[id]/route.ts`
- `apps/web/src/app/api/missions/[id]/tasks/route.ts`
- `apps/web/src/app/api/missions/[id]/executions/route.ts`
- `apps/web/src/app/api/missions/[id]/autonomous-run/route.ts`
- `apps/web/src/app/api/artifacts/route.ts`

Projetos usados em conversas/missões agora precisam pertencer ao usuário. `currentTaskId`, `parentTaskId` e `conversationId` são validados contra o usuário e a missão correta. Uploads não podem ser anexados a uma missão de outro usuário. O GET de conversas também limita o join de projeto ao tenant atual.

### 4. Sandbox, export e ops key — corrigido

Arquivos:

- `apps/web/src/lib/runtime/tools/namespace.ts`
- `apps/web/src/lib/chat/exportToolRunner.ts`
- `apps/web/src/lib/mcp/auth.ts`
- testes de sandbox/export

Não há mais fallback persistente `anonymous__default`. Filesystem/export sem `userId` são recusados antes de montar namespace. O export do chat repassa o `userId` real. `PLUTAO_MCP_USER_ID` precisa ser UUID; configuração inválida responde fail-closed com erro de serviço.

### 5. Redaction — ampliado

Arquivos:

- `apps/web/src/lib/security/sanitize.ts`
- `apps/web/src/lib/security/__tests__/sanitize.test.ts`

Foram adicionados padrões para Telegram bot token, JWT compacto, AWS `AKIA` e valores nomeados de token/secret Cloudflare. A sanitização continua centralizada e idempotente.

### 6. Ingestão XLSX e headers — endurecidos

Arquivos:

- `apps/web/src/lib/documentParser.ts`
- `apps/web/src/app/api/artifacts/route.ts`
- `apps/web/next.config.ts`
- testes do parser

O limite de upload já existente é verificado antes do parse. O parser ExcelJS ganhou timeout de 8 segundos e leitura de `richText`; a rota também valida ownership de `missionId`. Foram adicionados `Permissions-Policy`, `X-Permitted-Cross-Domain-Policies` e HSTS em produção, mantendo os headers existentes.

## Evidência local

Comandos executados nos branches:

```text
npm run typecheck
TYPECHECK_EXIT=0

npx vitest run apps/web/src/lib/mcp/__tests__/oauthRedirect.test.ts \
  apps/web/src/app/api/oauth/authorize/__tests__/authorizeRoute.test.ts
2 arquivos, 11 testes passando

npx vitest run \
  apps/web/src/lib/security/__tests__/sanitize.test.ts \
  apps/web/src/lib/__tests__/documentParser.test.ts \
  apps/web/src/lib/mcp/__tests__/oauthRedirect.test.ts \
  apps/web/src/lib/runtime/tools/__tests__/sandboxHardening.test.ts \
  apps/web/src/lib/runtime/tools/__tests__/export.test.ts
5 arquivos, 42 testes passando

npx vitest run ...conversationIdRoute.test.ts
3 arquivos, 33 testes passando
```

Os checks de CI/Vercel dos PRs foram iniciados; o merge deve ocorrer somente após todos terminarem verdes.

## Itens corretos, mas ainda pendentes por dependerem de decisão/migration

1. **Rate limit persistente de MCP e write gates:** os mapas em memória não são suficientes como limite global serverless. A solução correta exige escolher Neon (migration/tabela e transação atômica) ou Redis/Upstash. Não foi implementada uma falsa garantia local nem aplicado SQL sem autorização.
2. **TTL/reaper de write gates:** requer `expires_at`, índice, regras de claim e job/reaper operacional. Deve ser uma migration aditiva idempotente e precisa de plano de execução aprovado.
3. **Supabase service_role e allowlist por tabela/coluna:** os filtros estruturados e o fallback SQL já estão fail-closed quando há filtros. A mitigação completa do risco de `service_role` exige definir se o produto adotará RLS/anon key ou uma política persistida de tabelas/colunas por conector; inventar uma allowlist vazia quebraria leituras legítimas, e aceitar a chave sem política manteria o oráculo.
4. **Merge/CAS do checkpoint e lock distribuído do agent loop:** os limites e a deduplicação existentes foram auditados, mas a garantia forte contra duas retomadas concorrentes exige CAS/lock persistente com contrato de retry e testes de corrida. Não foi mascarada como corrigida.
5. **Smoke OAuth autenticado real:** não executado por depender de uma conta/cliente externo. Os testes locais cobrem rejeições de redirect e PKCE.
6. **Baseline/ledger Neon:** documentado, não aplicado.

## Conclusão

Os achados de OAuth, migration safety, IDOR relacional, namespace compartilhado, identidade da ops key, redaction, upload e headers eram válidos e receberam correções testadas. Os pontos que exigem escolha de infraestrutura ou alteração de schema ficaram explicitamente pendentes, sem declarar o Plutão “100% sem risco”: essa afirmação não seria tecnicamente honesta enquanto rate limit distribuído, TTL/reaper e CAS de checkpoint não estiverem implementados e validados em produção.
