# Contrato de missão e grafo v2 do Plutão

**Status (2026-10-08):** intake unificado, grafo versionado persistido, execução serial no worker, espera/retomada de Write Gate, visualização do grafo e dois perfis especialistas seriais estão no código publicado após o PR #137. O schema 0024–0026 está aplicado e verificado em produção; o worker autenticado já respondeu ao probe operacional, mas o smoke de missão completa permanece pendente. Eventos canônicos e paralelismo continuam pendentes.

## Objetivo

Evoluir o plano sequencial `MissionPlanV1` para um DAG versionado sem criar fontes concorrentes de estado. Chat, Cockpit, PWA e APK devem observar a mesma missão e a mesma execution mantidas no servidor.

## Fonte de verdade e responsabilidades

- **Missão:** objetivo, contexto, restrições, origem, vínculo opcional com conversa e Definition of Done.
- **Grafo versionado:** topologia imutável durante uma execution: nós, dependências, papel especialista, capabilities requeridas e política limitada de tentativas.
- **Execução do nó:** estado mutável, tentativa, lease, checkpoint, saída e referências de evidência. Não deve ser gravada dentro da definição imutável do grafo.
- **Worker do servidor:** única autoridade para claim, execução, retry, cancelamento e retomada quando a missão está no modo server-side.
- **Eventos da missão:** trilha canônica para progresso, nó, tentativa, ferramenta, gate, artefato e verificação. As interfaces exibem projeções desses eventos.
- **Permissões:** cada chamada resolve novamente capabilities e ownership no servidor; o papel de especialista não aumenta autorização nem substitui Write Gate.

## Contrato de domínio implementado

`packages/domain/src/mission-workspace/graphV2.ts` define `MissionGraphV2`, limites para tamanho, tentativas e timeout, um validador de dependências e conversão de `MissionPlanV1` para uma cadeia linear equivalente.

O validador rejeita versão inesperada, lista vazia ou acima do limite, nós malformados, ids duplicados, referências ausentes, auto-dependências, dependências duplicadas, ciclos e políticas de retry fora do limite. O adaptador V1 preserva ids e a ordem dos passos, não altera status legado e não muda ainda o executor.

## Entrada única de missão

1. O Cockpit cria a missão pela API compartilhada de intake.
2. O chat transforma pedidos multi-etapa em proposta revisável; após aceitação, chama o mesmo intake, incluindo `conversationId` quando válido.
3. O intake aplica ownership, idempotência, validação, origem (`chat`/`cockpit`) e política de autenticação.
4. Uma proposta de grafo é validada antes de ser alinhada e enfileirada.
5. Intents offline guardam somente a intenção de criação e sua chave de idempotência. Enquanto não forem sincronizadas, são **pendentes locais**, não uma missão em execução.

A API deve manter a regra atual de acesso: não conceder execução de missão a convidados por acidente. Uma futura experiência de convidado precisa ser decidida separadamente.

## Compatibilidade e rollout

1. Leitura dual: aceitar planos V1 e grafos V2; mostrar V1 por um adaptador de visualização.
2. **Estado atual:** novas missões recebem grafo unitário V2 no intake; planos V1 são adaptados a uma cadeia serial validada. A gravação ainda não tem feature flag.
3. O worker serial libera um nó por invocation quando dependências passaram, valida checkpoint/fingerprint e limita topologia a 20 nós nesta tranche.
4. Cada nó mantém tentativas/estado no checkpoint e sincroniza o status legado de passo quando existe. DoD usa somente evidências da mesma execution/nó; `GATE_PENDING` não vale como efeito executado.
5. Write Gates vinculados à execution pausam o job como `WAITING_APPROVAL`; aprovação/rejeição grava evidência correlacionada e libera o mesmo job. A corrida entre decisão humana, pausa do worker e persistência da evidence é reconciliada sem executar o nó em paralelo; gates terminais abandonados também são recuperados pelo cron. Nenhuma capability adicional é concedida ao nó.
6. O worker processa um job por invocation para caber no limite de duração da plataforma. Isso privilegia segurança; throughput e velocidade precisam ser medidos antes de paralelizar.
7. Perfis especialistas podem ser atribuídos a nós em modo serial, com allowlist restritiva e gates inalterados. Concorrência permanece desabilitada; habilitá-la exige isolamento, claim/cancelamento, idempotência, limites de custo e testes concorrentes.
8. Missões legadas com plano parcialmente executado e sem checkpoint V2 são bloqueadas para revisão, evitando repetição silenciosa de efeitos.
9. Remover V1 apenas depois de inventário e plano de migração/retensão aprovados.

## Perfis especialistas seriais

`software_engineer` orienta inspeção/implementação/testes e permite `note`, `filesystem`, `github`, `vercel` e `files.export_markdown`. `teaching_assistant` orienta explicações e materiais de aprendizagem e permite `note`, `filesystem` e exports PDF/XLSX/Markdown. São perfis de prompt e allowlist no mesmo runtime/worker — não criam workers paralelos nem elevam acesso.

A atribuição usa `PATCH /api/missions/:id/plan` com `action: "assign_specialist"`, enquanto o plano não está alinhado. Após o alinhamento, o grafo é imutável. `requiredCapabilities` do nó, quando usado com perfil, contém IDs como `tool:github`; todos devem pertencer à allowlist desse perfil. A política do nó é validada no endpoint, novamente no scheduler/model step, e no dispatcher antes de qualquer execução. O registro de capabilities do conector, ownership, status conectado, controles, rate limits e Write Gates continuam sendo a autoridade final. Perfil desconhecido, capability incompatível ou nó ativo ausente resulta em falha fechada.

## Persistência e execução serial implementadas

- `/api/missions` é o intake comum de chat, Cockpit e reconciliação offline: autenticação, ownership opcional da conversa, chave idempotente e origem são validados no servidor.
- `missions.graphVersion` e `missions.missionGraph` guardam a topologia versionada; o estado de execução por nó fica no checkpoint da execution, não na definição imutável.
- `/api/missions/:id/plan` cria/alinha o plano V1 e persiste a representação V2 validada; gravações pré-alinhamento e alinhamento comparam estado/grafo esperado para recusar corridas concorrentes. Depois de alinhar/iniciar, a topologia fica imutável.
- O enqueue valida/backfilla o grafo antes de criar o job. Topologias acima de 20 nós são rejeitadas nesta versão serial.
- Uma chamada do worker processa no máximo um nó e usa continuation do mesmo job. Aprovação humana põe o job em espera em vez de converter pedido de aprovação em sucesso.
- O schema de `runtime_jobs` da 0024 já existia. As migrations 0025/0026 foram aplicadas em `main` em 2026-10-07; a inspeção read-only confirmou colunas, tipos, nulabilidade, default, FK `ON DELETE SET NULL` e índice. O deployment do código foi confirmado pelo worker em 2026-10-08; o smoke autenticado multi-nó, a retomada mobile e o gate pendente ainda permanecem necessários.

## PWA, APK e execução offline

O APK Android é um shell Capacitor que abre a URL do PWA. Portanto, ambos usam a mesma API, o mesmo login, o mesmo worker e o mesmo estado servidor; não se deve implementar um scheduler independente em JavaScript/Android.

O fechamento, pausa ou suspensão do WebView não deve cancelar uma missão server-side. Na reabertura, a interface recarrega missão, grafo, execution, gates e cursor de eventos. O service worker pode cachear a interface e permitir leitura apropriada, mas não é o executor durável.

O modo local/offline é uma modalidade separada. Não trocar automaticamente uma execution ativa do servidor por um loop local: transferência de ownership exige lease/epoch, checkpoints compatíveis, fencing contra execução dupla e regras para operações com efeitos externos. Até isso existir e ser testado, a rede indisponível pode enfileirar uma criação local, mas não deve prometer execução da missão.

## Computador: evolução integrada ao grafo

O painel do Computador combina o feed textual de `action`/`observation` ligado a `conversationId` e replay SSE com uma leitura do grafo e do checkpoint persistido da missão selecionada. `MissionExecutionView` mostra a mesma topologia junto à timeline V1 de compatibilidade. Isso não é uma tela de computador remoto nem uma trilha canônica de eventos por missão. A evolução restante deve ser incremental:

1. **Visão por missão:** implementação local concluída para nós, dependências, status serial, tentativas e gate aguardando aprovação; falta validar visualmente após deploy e em missão real.
2. **Timeline de especialistas:** agrupar eventos por nó, perfil, tentativa e dependências, com duração, retry e bloqueio.
3. **Ações e observações legíveis:** mostrar capability, resumo sanitizado do input, resultado, status e link para artefato completo; segredos e payloads sensíveis continuam redigidos.
4. **Evidência visual real:** se houver browser/screenshot capability autorizada, anexar snapshots e artefatos com data, origem e relação ao nó; não simular uma tela ao vivo usando texto de ferramentas.
5. **Intervenção segura:** controles de pausar, retomar, cancelar e aprovar aparecem junto ao nó que os exige; confirmação permanece ligada ao gate server-side.
6. **Modo mobile:** resumo compacto no APK/PWA, indicador de conexão, atualização ao retomar e acessibilidade para leitores de tela.
7. **Diagnóstico do ciclo de desenvolvimento:** para missões de software, agrupar alterações/diff, comandos, testes, preview e artefatos sob o nó correspondente, mantendo o histórico auditável.

Eventos devem usar uma trilha canônica de missão e cursor estável; o stream de conversa pode referenciar/projetar esses eventos para o Computador dentro do chat. Polling periódico e SSE devem poder coexistir durante a migração sem duplicar eventos.

## Critérios de aceite antes de habilitar execução V2

- Mesmo pedido no chat e no Cockpit gera contratos de missão equivalentes e idempotentes.
- Toda missão nova inclui grafo V2 unitário; plano do chat/cockpit persiste grafo serial topologicamente válido.
- Uma invocation executa no máximo um nó; continuation reutiliza job e execution; retomada de checkpoint não duplica tentativa ou efeito já idempotente.
- Write Gate pendente deixa execution recuperável, job fora do claim, e aprovação/rejeição retoma o mesmo job sem bypass.
- Evidência `GATE_PENDING`, de outro nó ou de outra execution nunca satisfaz o DoD do nó atual.
- Planos V1 carregam e mantêm ordem/status; grafos com ciclo são rejeitados antes de executar.
- Fechar/reabrir PWA e APK recupera a mesma missão sem duplicate enqueue.
- Eventos fazem replay após desconexão e não dependem apenas de memória do cliente.
- Duas instâncias do worker não executam o mesmo nó simultaneamente.
- Cancelar a missão impede novos claims e propaga cancelamento aos nós ativos.
- Capability não autorizada e escrita sem gate são recusadas para todos os perfis.
- A falta de evidência ou falha no DoD impede conclusão, mesmo com saída textual afirmativa.
- Modo offline distingue claramente intent pendente de missão server-side em execução.
- Builds Web e APK, typecheck, testes unitários, testes de migração e smoke autenticado passam antes do rollout.
