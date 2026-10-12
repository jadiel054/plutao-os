# Relatório final — smoke de fila, Write Gate e ownership

**Data:** 2026-10-10 (UTC−03)
**Ambiente:** produção — `https://plutao-os.vercel.app`
**Conclusão:** **PARCIAL.** T3 foi verificado para os recursos cobertos. T4 terminou em falha e T5 (`teaching_assistant`) não produziu saída avaliável. T1/consumer e T2/H1 continuam sem verificação completa.

**Atualização (2026-10-12):** o preflight read-only na branch `main` do Neon encontrou **0 executions órfãs**. A migration `0027_execution_mission_fk` foi aplicada; a FK agora existe, está validada e usa `ON DELETE CASCADE`. O pós-check retornou novamente **0 órfãos**. A hipótese sobre a filesystem fora de `/tmp` mencionada pelo usuário não foi investigada e fica para a próxima rodada.

Nenhum e-mail, senha, cookie, token, valor de secret ou conteúdo da missão foi incluído neste relatório. Na rodada do smoke de 10/10 não houve leitura de secrets, `workflow_dispatch`, chamada manual do worker, escrita externa, criação de repositório ou migration; a migration 0027 foi aplicada em 12/10, conforme acima. A/B foram criadas pelo cadastro normal com `termsAccepted=true`, conforme autorização explícita, e permanecem cadastradas para T2. As sessões de teste permanecem somente na memória do runner ocioso desta sessão; não foram gravadas em arquivo ou secret.

## Resultados T1–T5

### T1 — Consumer e enqueue: **NÃO VERIFICADO**

As sondagens públicas anteriores ao T4 — `GET`, `POST` sem autenticação, `POST` com Bearer inválido e `POST` com corpo forjado — retornaram `404`. Não alteraram jobs no Neon. O `POST /api/missions/:id/autonomous-run` autenticado do T4 retornou `202` com `RUNTIME_WORKER_QUEUE_ENABLED=true` no deployment de teste, mas a execução terminou em falha e não foi possível atribuir conclusivamente a invocation ao callback Vercel Queue em vez de um fallback agendado.

A consulta agregada de observabilidade Vercel retornou `400 bad_request`. As consultas de runtime logs agrupados por `requestPath` vieram sem linhas e não são tratadas como contagem zero. A leitura de metadados de runs do GitHub Actions também não ficou disponível; nenhum workflow foi despachado. Portanto, não se declara o consumer nem a entrega Queue como verificados. [1] [2]

### T2 — Write Gate H1: **NÃO TESTADO**

Nenhum gate foi criado, aprovado, rejeitado ou retomado. Nenhum repositório foi criado e não houve escrita externa. O caso aguarda uma identidade GitHub dedicada a testes, diferente da conta do fundador, conforme solicitado.

### T3 — Ownership A/B: **VERIFICADO no escopo testado**

As contas de teste A e B foram criadas pelo fluxo normal. Na missão sintética `5de283ef-f106-47e2-ad8c-0d4f604e3eb8`, as listas do proprietário A mostraram projeto, conversa e missão; as listas de B os ocultaram. Para missão, evidência, tasks, executions, telemetry, plano e operações de runtime, as tentativas de B contra o recurso de A retornaram o mesmo `404` que um UUID inexistente. PATCH de missão, criação de task e referências cruzadas de projeto/conversa também falharam de forma equivalente a recurso inexistente.

O replay do mesmo intake devolveu a mesma missão; a mesma chave com payload divergente retornou `409`. Perfil desconhecido e capability incompatível retornaram `422`; o grafo permaneceu inalterado no teste de capability e, depois do alinhamento, a tentativa de mutação retornou `409`. A atribuição de `teaching_assistant` ocorreu antes do alinhamento.

Não havia registro real de connector nem gate para testar ownership direto desses objetos; esses dois subcasos permanecem não testados. O resultado não valida T2/H1.

### T4 — Missão ponta a ponta com Queue ligada: **FALHOU / NÃO VERIFICADO**

O deployment de produção `dpl_EhQd6QAD5k1JUFub6DTMtxYV394j`, SHA `0e7beee9c073260a324962c840cb7ef42226cb40`, ficou READY com o flag habilitado apenas em Production. O enqueue autenticado retornou `202` e criou o job `b73c7163-d5d1-4a04-82df-6b15b5a347d9` e a execution `c87101a0-78da-4e1d-aa73-dfeb807786b6` para a missão de A.

O runner observou a sequência `RUNNING/PENDING/EXECUTING` → `RUNNING/RUNNING/EXECUTING` → `FAILED/FAILED/FAILED`. O tempo decorrido foi **19.606 ms (19,6 s)**. A consulta Neon confirmou missão, job e execution em `FAILED`, com `attempts=1/14`, zero gates e duas evidências: `model_step` e `tool_error`. O erro foi classificado de forma redigida como associado à filesystem; o texto bruto não foi lido nem registrado. Não houve evidência de escrita bem-sucedida, read-back ou DoD; a missão não chegou a `COMPLETED`.

Assim, o enqueue foi aceito e um worker processou o job, mas o cenário ponta a ponta não passou e a origem exata da invocation não ficou comprovada. Nenhuma escrita externa foi tentada.

### T5 — Piloto `teaching_assistant`: **FALHOU; qualidade não pontuada**

A mesma missão foi atribuída ao perfil antes do alinhamento. A única execução terminou na falha de tool descrita em T4. Métricas observadas: latência **19.606 ms (19,6 s)**, falhas **1/1**, qualidade **N/A** porque não houve artefato/read-back concluído sobre o qual aplicar a rubrica. `software_engineer` permanece não testado, conforme combinado.

## Flag e estado atual de Production

Como T4 não passou, o flag não foi mantido ligado. O valor final em Production é `RUNTIME_WORKER_QUEUE_ENABLED=false`; o deployment seguinte, `dpl_Cc79gvVvSU4EsxJJWpU4f3SeAKZM`, ficou READY no mesmo SHA e assumiu o alias `plutao-os.vercel.app`. A raiz pública respondeu `200`. O worker não foi chamado manualmente e nenhum cron/workflow foi alterado.

## Missões antigas e cleanup

Antes da exclusão, os dois IDs foram confirmados pelo predicado `objective LIKE 'Pacote B:%'`:

- `4f75a383-a2ee-4eac-a97e-9f86ebc97b08` — `CREATED`, criado em `2026-10-08T22:56:58.664Z`; zero jobs e zero executions, sem atividade.
- `0a584fe4-f3be-4890-96d7-5d6580af0198` — `CANCELLED`, criado em `2026-10-08T23:06:55.107Z`; tinha exatamente um job `CANCELLED` e uma execution `CANCELLED`, sem atividade ou gate.

Ambas as missões foram apagadas pelos IDs exatos depois de confirmar o prefixo sintético e a ausência de jobs, executions e gates ativos. O job `744221fd-930f-4aca-b4be-841929c33e60` foi removido em cascade ao excluir sua execution terminal `30b81db6-81da-499a-bffe-ed6377054ca9`.

A missão e a conversa criadas nesta rodada foram removidas por DELETE autenticado, ambos HTTP `200`. O projeto sintético de A também foi removido por ID, após confirmar zero referências. O job do T4 já não existia após o DELETE da missão, mas a execution `FAILED` permaneceu; ela foi removida por SQL restrito ao ID, à missão e à conta A. As contas A/B não foram apagadas.

A verificação read-only final retornou: **2 contas preservadas; 0** linhas para o projeto, conversa, missões, task, jobs e executions sintéticos; **0 runtime_jobs ativos**.

## SQL e alterações aplicadas

**SQL de escrita aplicado:**

1. `DELETE FROM executions` para (a) `c87101a0-78da-4e1d-aa73-dfeb807786b6`, `FAILED`, da missão T4, com `user_id` da conta A validado e sem runtime job/gate; e (b) `30b81db6-81da-499a-bffe-ed6377054ca9`, `CANCELLED`, da missão antiga `0a584fe4-f3be-4890-96d7-5d6580af0198`, condicionado à existência do job `CANCELLED` exato `744221fd-930f-4aca-b4be-841929c33e60` e à ausência de gate. O UUID de usuário A foi omitido deste relatório.
2. `DELETE FROM missions` limitado aos dois IDs antigos, aos status `CREATED`/`CANCELLED` esperados, ao prefixo `Pacote B:` e a zero referências a runtime jobs, executions e gates.
3. `DELETE FROM projects` limitado ao projeto `b3e02548-fe1d-4de9-a2ad-59f62702bb21`, ao owner A (UUID omitido) e à condição de zero missões/conversas referenciadas.

As demais consultas SQL foram read-only: estados agregados de runtime jobs/executions; status, prefixo sintético e contagem de filhos dos IDs antigos; estados/gates/evidências sanitizados do T4; contagem de referências do projeto; catálogo de FKs; e verificação final das contagens de cleanup e das duas contas. **Na rodada do smoke de 10/10, nenhuma migration, DDL, INSERT ou UPDATE foi aplicado no Neon.**

**Migration aplicada em 12/10:** `packages/db/drizzle/0027_execution_mission_fk.sql`. O preflight retornou `orphan_executions=0`, sem constraint homônima. Foi executado no Neon o bloco guardado do arquivo; o pós-check confirmou `executions_mission_id_missions_id_fk`, `contype=f`, `confdeltype=c`, `convalidated=true` e `orphan_executions=0`. O sandbox não tinha `DATABASE_URL_UNPOOLED` e o banco não tinha tabela `__drizzle_migrations`; por isso a DDL foi aplicada via conector Neon, sem criar ledger artificial nem reexecutar migrations antigas. O journal Drizzle e o README do pacote foram atualizados no repositório.

**Alterações externas não-SQL:** o flag Vercel foi habilitado temporariamente em Production para a tentativa autorizada de T4 e depois alterado para `false`; foram criados dois deployments do mesmo SHA, o último READY com o alias Production. Nenhum secret foi lido ou modificado.

## Achado de integridade e pendências

O schema Drizzle declara `executions.mission_id → missions.id ON DELETE CASCADE`, mas o Neon não tinha essa FK durante o smoke de 10/10. O DELETE HTTP da missão T4 deixou a execution `FAILED` órfã, removida pelo ID exato naquela rodada. **Resolvido em 12/10:** a migration `0027_execution_mission_fk` restaurou e validou a FK após preflight sem órfãos. A hipótese de falha de filesystem fora de `/tmp` permanece sem investigação, conforme o escopo definido pelo usuário.

Permanecem pendentes: comprovar a invocation Vercel Queue com observabilidade atribuível; investigar na próxima rodada o `tool_error` de filesystem citado pelo usuário e repetir T4/T5 até `COMPLETED` com DoD/read-back; executar T2/H1 e `software_engineer` quando houver uma conta GitHub dedicada; e então medir qualidade dos pilotos com uma execução bem-sucedida. Paralelismo continua desativado.

## Referências

[1]: https://vercel.com/docs/queues/observability "Vercel Queues Observability"
[2]: https://vercel.com/docs/queues "Vercel Queues"
