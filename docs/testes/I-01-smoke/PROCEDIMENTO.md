# Procedimento de Smoke Test I-01 — Prova da Missão Multi-Nó com Neon e Modelo Real

**Status:** aguardando aprovação explícita do dono do repositório.
**Nenhum passo deste procedimento foi executado com credenciais reais.**
Este documento descreve o protocolo completo para validar a prova I-01 (FASE 1) contra
Postgres real (Neon) com modelo de linguagem real, excluindo qualquer risco de alteração
em produção.

---

## 1. Objetivo

Provar, contra banco de dados real e provedor de modelo real, o mesmo comportamento já
verificado com mocks em `serialWorkerPipeline.test.ts`:

1. Missão com grafo de 2 nós dependentes é semeada com `execution` PENDING e
   `runtime_job` PENDING.
2. `processUserRuntimeJobs` reivindica o job 1 (`FOR UPDATE SKIP LOCKED`), executa o nó
   `software_engineer` via modelo real e registra a execução no pipeline durável.
3. A continuation do nó 1 agendada com `RUNTIME_JOB_CONTINUATION_DELAY_MS = 1000ms` faz o
   job voltar a PENDING e o nó 2 só executa após o nó 1 completar (ordem temporal real).
4. Estado final: `runtime_jobs.status = SUCCEEDED`, `executions.status = COMPLETED`,
   `missions.status = COMPLETED`, com evidência por nó em `metadata.missionNodeId`,
   checkpoint PASSED e relatório JSON gravado em `docs/testes/I-01-smoke/`.

---

## 2. Pré-requisitos, credenciais e permissões

| Credencial / recurso | Uso | Permissões necessárias | Produção? |
| --- | --- | --- | --- |
| Chave da API Neon com direito a criar **branch** | Criar branch efêmera a partir do projeto do Plutão OS | `create_branch` apenas | **Não** — nada toca o banco de produção |
| `SMOKE_DATABASE_URL` | String **pooled** da branch efêmera (fornecida ao criar a branch) | read/write na branch efêmera | Não |
| `DATABASE_URL_UNPOOLED` | URL **direta** (sem pooler) da MESMA branch efêmera, usada só pelo `drizzle-kit migrate` | DDL na branch efêmera | Não |
| Provedor de modelo real | Execução dos nós do grafo pela tool real do agent loop | API key válida com crédito (ex.: xAI/OpenAI/Gemini ou Groq via config existente) | Não — custo único de 2 chamadas de completions curtas |
| Nenhuma outra credencial | — | — | — |

**Explicitamente NÃO necessárias:** credenciais de produção do Neon, `DATABASE_URL` de
produção, Vercel, GitHub API limitada a operações de escrita, ou qualquer serviço pago
além do consumo mínimo do provedor de modelo.

**Custo estimado:** 2 chamadas de completion (alguns KB de tokens) + uma branch Neon
efêmera viva por minutos. Duração estimada: ~2–4 minutos (timeout do teste: 480 s).

---

## 3. Variáveis de ambiente

| Variável | Obrigatória | Valor |
| --- | --- | --- |
| `RUN_I01_SMOKE` | Sim | `1` — habilita o teste gatado |
| `SMOKE_DATABASE_URL` | Sim | Pooled connection string da **branch Neon efêmera** |
| `DATABASE_URL_UNPOOLED` | Sim (só para migrate) | Direct connection string da mesma branch efêmera |
| `MODEL_PROVIDER` | Sim | `xai` \| `openai` \| `gemini` (padrão do repo: `xai`) |
| `MODEL_API_KEY` | Sim | API key do provedor escolhido (ou `XAI_API_KEY` / `OPENAI_API_KEY` conforme `MODEL_PROVIDER`) |
| `MODEL_NAME` | Não | Override do modelo; usa o padrão do provedor se ausente |
| `DATABASE_URL` | **Não definir** | Se definida e igual a `SMOKE_DATABASE_URL`, o teste **falha imediatamente** antes de qualquer operação (guard anti-produção) |

---

## 4. Preparação (sem tocar em dados existentes)

```bash
cd <repo>

# 1. Criar branch efêmera no Neon (UI ou neonctl): branch "i01-smoke-<data>",
#    a partir do projeto do Plutão OS, vida útil curta. Copiar:
#    - pooled url   -> SMOKE_DATABASE_URL
#    - direct url   -> DATABASE_URL_UNPOOLED

# 2. Aplicar migrations NA BRANCH EFÊMERA (nunca em produção):
DATABASE_URL_UNPOOLED="<direct-url-da-branch>" npm run migrate -w @plutao/db

# 3. Conferir que nenhuma DATABASE_URL de produção está no ambiente:
env | grep -i database_url
```

Fase de escrita no banco: **apenas DDL de migrations** (idempotentes, já aplicadas em
produção) na branch efêmera. Nenhum `DROP`, `TRUNCATE` ou alteração de schema em bases
pré-existentes.

---

## 5. Execução

```bash
RUN_I01_SMOKE=1 \
SMOKE_DATABASE_URL="<pooled-url-da-branch>" \
MODEL_PROVIDER="<provedor>" \
MODEL_API_KEY="<api-key>" \
npx vitest run apps/web/src/lib/runtime/__tests__/pg/i01SerialSmoke.pg.test.ts
```

Sem essas variáveis, o teste é pulado (`describe.skip`) — já verificado localmente.

Gatilhos de segurança embutidos no runner:

- Guard `guardNonProd()`: recusa execução se `SMOKE_DATABASE_URL === DATABASE_URL`.
- Verificação de tabelas via `to_regclass` no `beforeAll`: se as migrations não foram
  aplicadas, o teste falha **antes** de semear qualquer dado.
- Semeia somente dados descartáveis: user `is_guest`, 1 mission, 1 execution,
  1 runtime_job.

---

## 6. Evidências esperadas

O runner grava um relatório JSON em `docs/testes/I-01-smoke/report-<timestamp>.json`
contendo, no mínimo:

- `jobStatus: "SUCCEEDED"` (runtime_job após as rounds de drenagem).
- `executionStatus: "COMPLETED"`.
- `missionStatus: "COMPLETED"`.
- `nodes`: status por nó — `COMPLETED` para ambos.
- `nodeEvidence`: evidência de cada nó em `metadata.missionNodeId` +
  `executionId` correspondente (Etapa 1 e Etapa 2, prova de dependência).
- `checkpoint`: registro PASSED do checkpoint de estágio.
- Rounds consumidas pela continuation (≥ 2 rounds reais de claim).

Assertivas do próprio teste que precisam passar (e registram a evidência):

- Job terminal em `SUCCEEDED` dentro de ≤ 30 rounds.
- Nó 2 executa só após COMPLETED do nó 1 (ordem temporal).
- Evidência de cada nó filtrada corretamente por `missionNodeId`.
- Cleanup: `DELETE FROM users WHERE id = <user semeado>` (cascade nas tabelas filhas via
  FK). Nenhum `DROP` de tabela, nenhum acesso a outros dados.

---

## 7. Garantias anti-produção

1. O teste só ativa com `RUN_I01_SMOKE=1` **e** `SMOKE_DATABASE_URL` explícita.
2. Guard de igualdade com `DATABASE_URL` — falha antes de qualquer conexão.
3. Banco alvo é branch Neon efêmera criada para o teste (descartável).
4. Única operação de remoção é `DELETE ... WHERE id = <seeded>` em cascata; sem `DROP`,
   sem `TRUNCATE`, sem migrations destrutivas.
5. Nenhuma credencial de produção é necessária nem solicitada.

## 8. Rollback

1. Deletar a branch efêmera no Neon (`i01-smoke-<data>`) — remove todos os dados
   semeados imediatamente.
2. Se o relatório JSON não for desejado no repositório, descartar
   `docs/testes/I-01-smoke/report-*.json` antes de commitar.
3. Nenhum outro recurso é criado; não há rollback adicional a fazer.

---

## 9. Checklist de aprovação

- [ ] Dono aprova execução com credenciais reais (chave Neon de criação de branch + API
      key de modelo).
- [ ] Branch efêmera criada e migrations aplicadas.
- [ ] Smoke executado e evidências JSON colhidas e coladas no PR #199.
- [ ] Branch Neon deletada (limpeza completa).
