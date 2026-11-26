# PROPOSTA de banco — `computer_sessions` → MIGRATION 0031 CRIADA (pendente de aplicação)

> **Estado atual (26/11/2026, auditoria de 2º nível):** a migration
> `packages/db/drizzle/0031_computer_sessions.sql` FOI CRIADA a partir desta
> proposta e registrada no journal (`meta/_journal.json`, idx 28). A aplicação
> no Neon AINDA NÃO foi executada — cabe a um agente/operador autorizado
> aplicar no SQL Editor (padrão da casa). Enquanto a tabela não existir, o
> `NeonSessionStore` degrada (fail-safe) e o computador real permanece
> indisponível em produção.

> **Para o ChatGPT auditar.** O SQL abaixo é a origem exata da migration. Nenhuma
> tabela foi criada por este processo e nenhuma operação no Neon foi executada.

## Sobre

- **Repositório:** jadiel054/plutao-os (branch `vibe/real-computer-provider-90f7e3`, PR #204)
- **Módulo:** Computador do Plutão (fases 1–5) — ver `docs/COMPUTADOR_DO_PLUTAO.md`
- **Por que uma tabela:** exclusividade ATÔMICA de UMA sessão simultânea por
  instalação ENTRE instâncias Vercel distintas; contabilidade durável da cota
  de unidades; controller persistente (agente×humano) legível por qualquer
  instância; coordenação do canal vivo do Chromium (`channel_instance`);
  expiração de sessões abandonadas.

## Separação de planos (auditoria da PR #204)

| Plano | O que é | Onde vive |
|---|---|---|
| **Control plane (Neon)** | metadados da SESSÃO: reserva, autorização, controller, lease, cota, dono do canal | tabela `computer_sessions` |
| **Data plane (Vercel)** | o canal VIVO do Chromium: conexão CDP, screencast, input | instância que abriu o navegador (`channel_instance` + `channel_expires_at`) |

A tabela resolve os metadados; o canal vivo NÃO fica preso à tabela: cada
instância registra-se como dona do canal com lease (heartbeat do SSE do
stream e do input). Quando o lease expira (instância morreu/foi reciclada),
outra instância assume o canal reabrindo o navegador com o MESMO id durável —
no Browserless Free isso é um navegador NOVO (estado de navegador perdido,
documentado na UI). O estado que sobrevive é o do sandbox da conversa.

## Modelo de dados proposto (Drizzle, `packages/db`)

```ts
export const computerSessions = pgTable(
  "computer_sessions",
  {
    id: text("id").primaryKey(),                       // `cmp-<uuid>` gerado pelo app
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),

    // Estados: creating → ready → (reconnecting) → closed | expired | error
    status: text("status").notNull(),

    controller: text("controller").notNull().default("agent"), // agent | human
    controllerChangedAt: timestamp("controller_changed_at", { withTimezone: true }),
    // Guarda de ação humana em andamento: enquanto != NULL e no futuro, a
    // devolução do controle é RECUSADA (a ação não sobrevive à devolução).
    humanActionUntil: timestamp("human_action_until", { withTimezone: true }),
    // FENCING TOKEN (3ª auditoria): token exclusivo da ação humana em andamento
    // ('act-<uuid>'). Renovação/liberação são CAS pelo token — uma ação antiga
    // NÃO renova nem libera o lock de uma ação mais recente. Limpo por
    // casController (troca de controle), close, sweepExpired e clearHumanAction.
    humanActionToken: text("human_action_token"),

    provider: text("provider").notNull(),              // browserless | self-hosted
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),

    unitsUsed: integer("units_used").notNull().default(0), // 1 un = 30s de navegador
    noInputTimeout: boolean("no_input_timeout").default(false),

    // CANAL VIVO (data plane) — dono atual do navegador + lease por heartbeat
    channelInstance: text("channel_instance"),
    channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),

    // Contabilidade mensal da cota ('YYYY-MM' fixado na reserva)
    billingMonth: text("billing_month").notNull(),

    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    // VER NOTA ABAIXO: gate de linha viva única — índice único parcial CONSTANTE.
    index("computer_sessions_user_conversation_idx").on(t.userId, t.conversationId),
    index("computer_sessions_lease_idx").on(t.leaseExpiresAt),
    index("computer_sessions_billing_month_idx").on(t.billingMonth),
  ]
);
```

### SQL equivalente (intenção exata — implementada em 0031_computer_sessions.sql)

```sql
CREATE TABLE IF NOT EXISTS computer_sessions (
  id            text PRIMARY KEY,
  conversation_id text NOT NULL,
  user_id       text NOT NULL,
  status        text NOT NULL,
  controller    text NOT NULL DEFAULT 'agent',
  controller_changed_at timestamptz,
  human_action_until    timestamptz,
  human_action_token    text,
  provider      text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL,
  units_used    integer NOT NULL DEFAULT 0,
  channel_instance    text,
  channel_expires_at  timestamptz,
  billing_month text NOT NULL,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz
);

-- GATE DA SESSÃO ÚNICA (CORREÇÃO da revisão): índice único PARCIAL por
-- expressão CONSTANTE em cima de "linha viva".
CREATE UNIQUE INDEX IF NOT EXISTS computer_sessions_single_live_uidx
  ON computer_sessions ((1))
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS computer_sessions_user_conversation_idx
  ON computer_sessions (user_id, conversation_id);
CREATE INDEX IF NOT EXISTS computer_sessions_lease_idx
  ON computer_sessions (lease_expires_at);
CREATE INDEX IF NOT EXISTS computer_sessions_billing_month_idx
  ON computer_sessions (billing_month);
```

## Requisitos de concorrência (contrato do store em `lib/computer/store.ts`)

1. **Reserve (criar sessão)** — gate PRIMEIRO, navegador depois: `INSERT`
   direto; conflito do índice único parcial (`23505`) ⇒ `SESSION_LIMIT`.
   Em seguida confere a cota mensal (`SUM(units_used) WHERE billing_month =
   mês corrente`) e se estourar fecha a própria linha — nada de cobrar.
2. **CAS do controle (agente↔humano)** em SQL:
   `UPDATE computer_sessions SET controller = $to, controller_changed_at = now()
   WHERE id = $1 AND controller = $from AND closed_at IS NULL` → 0 linhas =
   perdeu a corrida (409 CONTROL_CONFLICT).
   Para devolução (`human → agent`) há guarda extra:
   `AND (human_action_until IS NULL OR human_action_until < now())` →
   recusa a devolução enquanto ação humana executa (409 ACTION_INFLIGHT).
3. **Ação humana em andamento** (inflight):
   `UPDATE ... SET human_action_until = now() + 5s WHERE id = $1 AND
   closed_at IS NULL AND controller = 'human' AND (human_action_until IS NULL
   OR human_action_until < now())` — marca ATÔMICA que impede devolução
   durante o input. TTL de 5s auto-libera em crash da request.
4. **Canal vivo (data plane)**:
   `UPDATE ... SET channel_instance = $inst, channel_expires_at = now() + 30s
   WHERE id = $1 AND closed_at IS NULL AND (channel_instance IS NULL OR
   channel_instance = $inst OR channel_expires_at < now())` — steal apenas
   quando o lease do dono expirou. Heartbeat renova via SSE/input.
5. **Cota durável sem duplicação:** `units_used` é cumulativo por sessão e
   atualizado por `GREATEST(units_used, $valor)` — só o DONO do canal
   reporta valores, então não há dupla contagem entre instâncias. O bloqueio
   mensal é `SUM(units_used) WHERE billing_month = mês` antes de abrir nova
   sessão. Nenhuma cobrança automática em nenhum caminho.
6. **Expiração com contabilidade:** sweep lazy em cada operação relevante:
   `UPDATE ... SET status='expired', closed_at=now(), units_used = GREATEST(
   units_used, CEIL(EXTRACT(EPOCH FROM (now() - created_at))/30)::int) WHERE
   closed_at IS NULL AND lease_expires_at + 5s < now() RETURNING id` —
   mover para fechado libera o índice único parcial automaticamente.
7. **Decisões por linha retornada:** todo UPDATE decisório usa `RETURNING id`.
8. **Lock renovável de ação humana:** human_action_until é um LEASE
   renovado pelo dono do canal durante toda a execução; liberado no `finally`.
9. **Fencing token (3ª auditoria):** renovação e liberação são CAS pela
   coluna `human_action_token` — token STALE nunca afeta o lock mais recente.

## Ciclo de vida / estados

```
creating ──▶ ready ──▶ closed | expired
   │           ▲
   │           └──── reconnecting ──▶ ready (navegador NOVO no Free)
   └──▶ error
human control: campo controller alterna agent ↔ human (CAS em SQL), status não muda
ação humana: human_action_until é LOCK RENOVÁVEL com FENCING TOKEN
TTL do plano Free: 2 min por conexão; expiração com status 'expired'.
```

## Degradação honesta e cota

- **Sem a tabela (42P01), DATABASE_URL ausente ou Neon indisponível:** em
  PRODUÇÃO o wrapper (ResilientSessionStore) lança
  `PersistenceUnavailableError` — NUNCA há fallback para memória. Fallback em
  memória existe APENAS em desenvolvimento/testes (`allowDegraded` opt-in).
  NENHUM DDL é executado pelo app.
- **billing_month:** fixado na reserva; sessões que cruzam a virada do mês
  contam no mês de início — simplificação declarada, sem risco de cobrança.

## Necessidade da tabela

NECESSÁRIA para: (a) gate atômico de 1 sessão viva entre instâncias;
(b) controller legível/CASável por qualquer instância; (c) contabilidade
durável da cota de 1.000 unidades/mês; (d) coordenação do canal vivo do
Chromium com failover por lease.

Quando a migration for aplicada, o `sessionManager` passa a usar o
`NeonSessionStore` automaticamente (detecção de tabela + degradação);
nenhum código de aplicação muda.
