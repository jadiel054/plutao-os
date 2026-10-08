# Plataforma autônoma confiável — fundação

## O que esta PR entrega

### Worker durável

A rota de execução autônoma cria uma linha na tabela `runtime_jobs` vinculada a uma `execution`. O request obtém um lease e executa o loop atual; se o processo cair, o job fica recuperável após o lease de oito minutos. O endpoint `POST /api/cron/runtime-worker` reivindica uma unidade por vez com atualização condicional, processa no máximo um job por disparo e reencaminha falhas até cinco tentativas.

A migration `0024_autonomous_platform_foundation.sql` precisa ser aplicada com `DATABASE_URL_UNPOOLED` antes de esperar recuperação após crash. Enquanto ela não existir, a rota preserva o comportamento direto anterior e registra um aviso operacional — isso evita uma quebra durante rollout, mas não deve ser confundido com durabilidade ativada.

### Observabilidade

Eventos `runtime.telemetry` são gravados no `audit_events` com `requestId`, missão, execution, job, tentativa, duração, estado e erro sanitizado. `GET /api/missions/:id/telemetry` aplica autenticação e ownership antes de filtrar a missão. O payload não deve receber token, conteúdo integral de secrets ou credenciais.

### Separação Chat/Cockpit

- Missões disparadas no Chat continuam podendo receber orientação do agente e seguem seu fluxo de conversa.
- Missões criadas no Cockpit continuam sob controle dos estados e ações do Cockpit.
- O `CockpitAgentFab` é somente assistência contextual. O vínculo com a missão aberta exige checkbox explícito; abrir o composer não cria missão, não inicia runtime e não muda status.

### Browser/computer-use

A política V1 implementada é uma fronteira segura, não um navegador remoto fingido. URLs aceitam somente `http`/`https`, recusam credenciais embutidas, hosts locais e limites excessivos. As ações são leitura/determinísticas (`navigate`, `extract`, `screenshot`, `wait`) e ainda não existe backend de browser, live view ou human takeover. Escritas continuam bloqueadas até existir backend isolado, approval engine e evidência por ação.

### Avaliação de artefatos

`evaluateArtifact` faz checks determinísticos de conteúdo vazio, tamanho, JSON, HTML perigoso, padrões conhecidos de secrets e marcadores óbvios de erro. É uma barreira de qualidade, não uma prova de segurança ou correção semântica; o DoD ainda precisa de evidência verificável e revisão de contexto.

### E2E autenticado

`e2e/authenticated-cockpit.spec.ts` e o workflow manual `Authenticated Cockpit E2E` usam `E2E_EMAIL`/`E2E_PASSWORD` via secrets, criam uma missão com nome único, abrem o Cockpit e removem o registro ao final. O workflow é `workflow_dispatch` de propósito: não autentica em produção automaticamente a cada PR.

## Ativação operacional após merge

1. Confirmar que as migrations 0024–0026 estão aplicadas no Neon usando inventário read-only antes de qualquer nova migration.
2. Confirmar `CRON_SECRET` no Vercel e no GitHub Actions.
3. Disparar manualmente `Durable runtime worker` e verificar primeiro o probe read-only `/api/cron/runtime-worker/health`, depois o POST de processamento com HTTP 200.
4. Executar o E2E em um ambiente de teste com secrets dedicados.
5. Observar `runtime.telemetry` e falhas de lease antes de aumentar lote ou frequência.

## Não alegações

Esta PR não declara que o Plutão já possui browser autônomo de produção, Computer Use, live view, human takeover, avaliação semântica por LLM ou fila externa garantida. Essas capacidades continuam etapas seguintes, com aprovação, isolamento e testes E2E reais como pré-requisitos.
