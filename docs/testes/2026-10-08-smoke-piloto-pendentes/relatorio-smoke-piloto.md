# Relatório de status — smoke serial e piloto de especialistas

**Data da execução:** 2026-10-08 (horário local, UTC−03)

**Ambiente:** produção — `https://plutao-os.vercel.app`

**Status geral:** **PENDENTE — houve validação parcial de APIs em produção, mas não houve execução real de nó, gate ou piloto de modelo.**

> Um run verde só conta para os comportamentos que o teste realmente observou. O E2E mínimo do Cockpit, um health probe ou a validação do grafo não substituem evidência de execução serial, retomada, Write Gate ou qualidade dos especialistas.

## Evidências reais

| Verificação | Resultado observado | Limite da evidência |
| --- | --- | --- |
| E2E mínimo do Cockpit | [Run #37853714597](https://github.com/jadiel054/plutao-os/actions/runs/37853714597): **success**, Playwright `1 passed (8.3s)` em produção. Login, Cockpit, criação/abertura de missão e visualização de ciclo de vida/timeline/evidências passaram. | Não executou grafo multi-nó, worker serial, Write Gate nem piloto de especialistas. Não foi repetido nesta rodada. |
| Health/probe do worker | [Run #37801314539](https://github.com/jadiel054/plutao-os/actions/runs/37801314539) passou o probe autenticado. | Confirma health/reconciliação, não execução de uma missão. |
| Primeira tentativa do pacote B | [Run #37856500905](https://github.com/jadiel054/plutao-os/actions/runs/37856500905) falhou no replay idempotente com HTTP 500. A consulta read-only da Vercel identificou a unique violation do Neon encapsulada em `cause.code=23505`. | O teste parou antes de plano, execution/job ou escrita externa. Uma missão sintética permaneceu em `CREATED`, sem plano e sem runtime job. Não foi executada. |
| Correção do replay idempotente | O [PR #145](https://github.com/jadiel054/plutao-os/pull/145) adicionou tratamento da cadeia `cause`, regressão unitária e cleanup best-effort para falhas futuras. Foi integrado com 5 checks verdes e publicado no deployment de produção `dpl_6xSHXXkviWsLcrcQvtpxWkQ1bxgc`, SHA `d2b0a8a367be21e5e8f5ccee1aa360373360ed18`, estado `READY`. | O deploy não é, por si só, validação do runtime. |
| Smoke serial após a correção | [Run #37857489190](https://github.com/jadiel054/plutao-os/actions/runs/37857489190): o intake criou a missão sintética; replay exato deduplicou; payload divergente retornou `409`; a listagem autenticada incluiu a missão e GET anônimo retornou `401`; capabilities incompatíveis e perfil desconhecido retornaram `422`; `software_engineer` e `teaching_assistant` foram atribuídos antes do alinhamento e o grafo permaneceu imutável após alinhamento. O teste enfileirou execution e job. | Após `2.052.776 ms` (34m12s), o teste terminou em `SERIAL_RUNTIME_TIMEOUT`. O teste não observou conclusão, checkpoint por nó, DoD nem evidência de ferramenta/modelo. Ownership foi testado apenas contra listagem própria e acesso anônimo; o caso negativo entre duas contas não foi executado. |
| Estado persistido do job/execution | Consulta Neon **somente leitura**, limitada à execução sintética daquele run: missão, job e execution ficaram `CANCELLED`; job `attempts=1/18`, erro sanitizado `MISSION_CANCELLED`; execution com erro sanitizado `MISSION_ALREADY_TERMINAL`; `activeNodeId=null` e sem estados de nó no checkpoint. | A invocation posterior reconciliou o cancelamento; não é evidência de que um nó tenha começado ou concluído. |
| Worker após o smoke | [Run #37866058588](https://github.com/jadiel054/plutao-os/actions/runs/37866058588) executou depois do timeout: o probe reportou `pending=1`, `running=0`, `waitingApproval=0`, `succeeded=0`, `failed=1`; o POST do worker processou o job sintético já `CANCELLED`. O workflow do worker está `active` e a configuração declarada é `*/5 * * * *`. | Não houve run de `runtime_worker.yml` na janela do smoke: o run anterior listado foi #37841948074 às 20:46Z e o seguinte #37866058588 às 00:41Z. Isto comprova a lacuna observada de invocações, não determina a causa do agendamento. O worker não deve ser disparado manualmente enquanto não houver isolamento seguro de jobs de outros usuários. |
| Migrations | Revisões anteriores confirmaram 0025/0026 aplicadas em `main`; esta rodada não encontrou necessidade de migration e não alterou o banco. | Não reaplicar 0025/0026. |

## O que foi e não foi validado

**Validado em produção nesta rodada, no nível de API/configuração:** replay idempotente e conflito do intake após #145; ownership positivo e rejeição anônima; fail-closed de perfil/capability; atribuição dos dois perfis antes do alinhamento; imutabilidade do grafo depois do alinhamento.

**Ainda não validado em produção:**

- Um nó executado por invocation do worker, continuação do mesmo job/execution, checkpoint e retomada sem efeito duplicado.
- Execution terminando em `COMPLETED` somente após DoD/evidence real por nó.
- Write Gate em `WAITING_APPROVAL`, aprovação e rejeição, retomada do mesmo job e ausência de bypass.
- Execução real dos especialistas, qualidade factual/DoD, latência de modelo e taxa de falha.
- Isolamento negativo entre duas contas para ownership.
- Retomada após refresh/fechamento do Cockpit/PWA/APK e validação visual.

**Write Gate nesta rodada:** não foi disparado; `write_gate=disabled`. Nenhum repositório privado foi criado e nenhuma escrita externa foi tentada. As tarefas do piloto usariam filesystem local isolado; os casos de gate ficam suspensos até haver worker executando com segurança.

## Bloqueio operacional e próximos passos

1. Investigar por que o workflow de worker, apesar de `active` e declarado a cada 5 minutos, não teve invocation durante a janela do smoke. Confirmar cadência observável sem despachar o worker global sobre jobs potencialmente pertencentes a outros usuários.
2. Retomar o smoke serial em janela na qual a cadência do worker esteja confirmada. Coletar uma invocation por nó, checkpoint/continuação, mesma execution/job, DoD/evidence por nó e estado final `COMPLETED`.
3. Executar aprovação e rejeição do Write Gate em dispatches separados, em conta E2E isolada; validar pausa/retomada do mesmo job. Aprovação de escrita só para o alvo privado exato mostrado no gate.
4. Só após execução real, medir rubricas de qualidade, latência e falhas de ambos os especialistas. Registrar métricas agregadas, sem tokens, PII ou payloads.
5. Manter paralelismo, Browser/Computer tool e migrations fora desta rodada; paralelismo continua desativado.

**Decisão operacional:** a validação foi interrompida após o timeout do worker. Não se declarou o smoke multi-nó nem o piloto como aprovados, não se disparou o worker manualmente por ser global e não foram realizadas escritas externas. Permanecem duas missões sintéticas na conta E2E: uma em `CREATED`, sem plano/job, e outra em `CANCELLED`, sem estado de nó. Ambas precisam de limpeza por fluxo autenticado quando a conta E2E puder ser usada; não foram removidas por SQL.
