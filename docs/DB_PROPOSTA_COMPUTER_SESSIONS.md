# PROPOSTA de banco — `computer_sessions` (não aplicada)

> **Para o ChatGPT auditar.** Este documento é um PROJETO de schema, não uma
> migration. Nenhuma migration foi criada, nenhuma tabela foi criada e nenhuma
> operação no Neon foi executada. Aplicação somente após auditoria.

## Sobre

- **Repositório:** jadiel054/plutao-os (branch `vibe/real-computer-provider-90f7e3`)
- **Módulo:** Computador do Plutão (fases 1–5) — ver `docs/COMPUTADOR_DO_PLUTAO.md`
- **Por que uma tabela:** exclusividade forte de UMA sessão simultânea por
  instalação entre instâncias serverless distintas (a garantia atual de CAS é
  em-processo); contabilidade durável da cota gratuita de unidades; autorização
  por usuário+conversa persistente; expiração de sessões abandonadas.

## Modelo de dados proposto (Drizzle, `packages/db`)

```ts
export const computerSessions = pgTable(
  "computer_sessions",
  {
    id: text("id").primaryKey(),                       // ex.: uuid gerado no app
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),

    // Estados: creating → ready → (reconnecting) → closed | expired | error
    status: text("status").notNull(),

    controller: text("controller").notNull().default("agent"), // agent | human
    controllerChangedAt: timestamp("controller_changed_at", { withTimezone: true }),

    provider: text("provider").notNull(),              // browserless | self-hosted
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),

    unitsUsed: integer("units_used").notNull().default(0),   // 1 un = 30s de navegador
    noInputTimeout: boolean("no_input_timeout").default(false),

    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    // Reserva at atomicamente: só UMA sessão em estados vivos por vez
    uniqueIndex("computer_sessions_active_uidx")
      .on(t.status),                                   // parcial — ver SQL
    index("computer_sessions_user_conversation_idx").on(t.userId, t.conversationId),
    index("computer_sessions_lease_idx").on(t.leaseExpiresAt),
  ]
);
```

### SQL equivalente (intenção exata)

```sql
CREATE TABLE IF NOT EXISTS computer_sessions (
  id            text PRIMARY KEY,
  conversation_id text NOT NULL,
  user_id       text NOT NULL,
  status        text NOT NULL,
  controller    text NOT NULL DEFAULT 'agent',
  controller_changed_at timestamptz,
  provider      text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL,
  units_used    integer NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz
);

-- UMA sessão viva por instalação: índice UNICO PARCIAL só nos estados vivos.
CREATE UNIQUE INDEX IF NOT EXISTS computer_sessions_active_uidx
  ON computer_sessions (status)
  WHERE status IN ('creating', 'ready', 'reconnecting');

CREATE INDEX IF NOT EXISTS computer_sessions_user_conversation_idx
  ON computer_sessions (user_id, conversation_id);
CREATE INDEX IF NOT EXISTS computer_sessions_lease_idx
  ON computer_sessions (lease_expires_at);
```

## Requisitos de concorrência

1. **Reserve (criar sessão):** `INSERT ... WHERE NOT EXISTS (sessão viva)` —
   equivalente: tentar `INSERT` e tratar conflito do índice único parcial
   (`23505`) como `SESSION_LIMIT`. Confere atomicamente entre instâncias.
2. **CAS do controle (agent↔human):** `UPDATE computer_sessions
   SET controller = 'human', controller_changed_at = now() WHERE id = $1 AND
   controller = 'agent'` → 0 linhas = perdeu a corrida (409 CONTROL_CONFLICT).
3. **Cota:** acumular `units_used` por sessão; bloquear nova reserva quando
   `SUM(units_used) >= 1000` no mês corrente (campo de orçamento é env, não
   banco — o banco só contabilidade).

## Ciclo de vida / estados

```
creating ──▶ ready ──▶ closed | expired
   │           ▲
   │           └── reconnecting ──▶ ready (novo navegador no Free)
   └──▶ error
human control: campo controller alterna agent ↔ human (CAS), status não muda
 TTL do plano Free: 2 min por conexão; expiração com status 'expired'.
```

- `expires`: leitura lazy + rotina atrás de lease vencido:
  `UPDATE ... SET status='expired', closed_at=now() WHERE lease_expires_at < now() AND status IN ('creating','ready','reconnecting')`
  (a chamada exige liberar o índice único parcial apenas ao mover para
  `expired` — status fora dos estados vivos).
- `units_used`: incremental (`UPDATE ... SET units_used = units_used + 1` por
  30s de uso, contabilizado no encerramento/expiração da sessão).

## Necessidade da tabela

NECESSÁRIA para o requisito "uma sessão simultânea por instalação" com
garantia entre instâncias (hoje: 1 por instância + recusa 429 do provedor
como salvaguarda). A cota de unidades também só é contabilidade real —
audível e resistente a reinício de instância — quando existe uma tabela.

Quando a migration for aplicada, o `sessionManager` passa a usar um
`SessionStore` apoiado nela (a interface já está isolarada no código; o
Chat/Provedor não mudam).
