# Contrato de missão e grafo v2 do Plutão

**Status:** contrato de domínio v2 e validação implementados; persistência, scheduler de nós e interfaces ainda não migrados.

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
2. Gravação V2 só para missões novas, atrás de feature flag e depois do smoke de produção.
3. Primeiro scheduler V2 serial: liberar um nó quando todas as dependências passaram; retries são limitados; sem ciclos nem fan-out ilimitado.
4. Registrar resultado e evidência por nó. A missão só chega a `COMPLETED` após o verificador validar o DoD com evidências.
5. Ativar perfis especialistas e concorrência gradualmente, depois de testes de isolamento, claim, cancelamento e idempotência.
6. Remover V1 apenas depois de inventário e plano de migração/retensão aprovados.

## PWA, APK e execução offline

O APK Android é um shell Capacitor que abre a URL do PWA. Portanto, ambos usam a mesma API, o mesmo login, o mesmo worker e o mesmo estado servidor; não se deve implementar um scheduler independente em JavaScript/Android.

O fechamento, pausa ou suspensão do WebView não deve cancelar uma missão server-side. Na reabertura, a interface recarrega missão, grafo, execution, gates e cursor de eventos. O service worker pode cachear a interface e permitir leitura apropriada, mas não é o executor durável.

O modo local/offline é uma modalidade separada. Não trocar automaticamente uma execution ativa do servidor por um loop local: transferência de ownership exige lease/epoch, checkpoints compatíveis, fencing contra execução dupla e regras para operações com efeitos externos. Até isso existir e ser testado, a rede indisponível pode enfileirar uma criação local, mas não deve prometer execução da missão.

## Computador: evolução integrada ao grafo

O painel atual é um feed textual de `action`/`observation` ligado a `conversationId`, com replay SSE. Ele não é ainda uma tela completa de computador remoto nem uma visualização do grafo. A evolução deve ser incremental:

1. **Visão por missão:** selecionar missão e nó ativo; funcionar mesmo se a missão nasceu no Cockpit e não tem conversa.
2. **Timeline de especialistas:** agrupar eventos por nó, perfil, tentativa e dependências, com estado, duração, retry e bloqueio.
3. **Ações e observações legíveis:** mostrar capability, resumo sanitizado do input, resultado, status e link para artefato completo; segredos e payloads sensíveis continuam redigidos.
4. **Evidência visual real:** se houver browser/screenshot capability autorizada, anexar snapshots e artefatos com data, origem e relação ao nó; não simular uma tela ao vivo usando texto de ferramentas.
5. **Intervenção segura:** controles de pausar, retomar, cancelar e aprovar aparecem junto ao nó que os exige; confirmação permanece ligada ao gate server-side.
6. **Modo mobile:** resumo compacto no APK/PWA, indicador de conexão, atualização ao retomar e acessibilidade para leitores de tela.
7. **Diagnóstico do ciclo de desenvolvimento:** para missões de software, agrupar alterações/diff, comandos, testes, preview e artefatos sob o nó correspondente, mantendo o histórico auditável.

Eventos devem usar uma trilha canônica de missão e cursor estável; o stream de conversa pode referenciar/projetar esses eventos para o Computador dentro do chat. Polling periódico e SSE devem poder coexistir durante a migração sem duplicar eventos.

## Critérios de aceite antes de habilitar execução V2

- Mesmo pedido no chat e no Cockpit gera contratos de missão equivalentes e idempotentes.
- Planos V1 carregam e mantêm ordem/status; grafos com ciclo são rejeitados antes de executar.
- Fechar/reabrir PWA e APK recupera a mesma missão sem duplicate enqueue.
- Eventos fazem replay após desconexão e não dependem apenas de memória do cliente.
- Duas instâncias do worker não executam o mesmo nó simultaneamente.
- Cancelar a missão impede novos claims e propaga cancelamento aos nós ativos.
- Capability não autorizada e escrita sem gate são recusadas para todos os perfis.
- A falta de evidência ou falha no DoD impede conclusão, mesmo com saída textual afirmativa.
- Modo offline distingue claramente intent pendente de missão server-side em execução.
- Builds Web e APK, typecheck, testes unitários, testes de migração e smoke autenticado passam antes do rollout.