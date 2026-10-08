# Relatório de status — smoke serial e piloto de especialistas

**Data:** 2026-10-08

**Ambiente:** produção — `https://plutao-os.vercel.app`

**Status geral:** **PENDENTE — não considerar smoke de missão nem piloto validados**

> Este registro separa evidência de disponibilidade do worker de evidência de uma missão executada. Um workflow marcado como `success` não é aprovação do smoke se o próprio teste foi `skipped`.

## Evidências já obtidas

| Verificação | Resultado | Limite da evidência |
| --- | --- | --- |
| Health/reconciliação do worker após o deploy | **Passou** no workflow `runtime_worker.yml`, run [37801314539](https://github.com/jadiel054/plutao-os/actions/runs/37801314539). | O probe read-only respondeu; não processou uma missão de usuário nem validou execução serial ponta a ponta. |
| Smoke autenticado do Cockpit | **Não executado**: run [37827811717](https://github.com/jadiel054/plutao-os/actions/runs/37827811717) terminou com o job `success`, mas o teste Playwright reportou `1 skipped`. `E2E_EMAIL` e `E2E_PASSWORD` estavam vazios. | Não valida login, criação/abertura de missão ou qualquer parte do Mission Graph V2 em produção. |
| Testes locais focados em especialistas/grafo | **14/14 passaram** em 4 arquivos: política de perfis, atribuição do plano, runtime serial e evidência do nó. | Evidência de código/mock; não substitui teste com sessão real, modelo configurado ou conectores do usuário. |
| Migrations Mission Graph V2 | **Aplicadas e verificadas anteriormente**: 0025/0026, incluindo colunas, FK e índice por consulta read-only. | Nenhuma migration pendente foi identificada para esta etapa. Não reaplicar essas migrations. |

## O que continua sem validação em produção

- Criação autenticada de uma missão pelo Chat e pelo Cockpit, ownership, vínculo opcional com conversa e idempotência.
- Execução serial multi-nó, persistência do checkpoint e retomada após fechar/reabrir a interface.
- Write Gate pendente, aprovação e rejeição, correlação com `executionId`/nó e retomada do mesmo job.
- Conclusão apenas quando a execution persistida chega a `COMPLETED`, incluindo DoD e evidências corretas por nó.
- Retentativas, timeout/interrupção, reconciliação e ausência de jobs órfãos ou sucesso prematuro.
- Validação representativa dos perfis `software_engineer` e `teaching_assistant`: atribuição antes do alinhamento; grafo imutável depois; perfil/capability/tool incompatível deve falhar fechado; permissões e Write Gates devem continuar obrigatórios.
- Qualidade factual, evidências/DoD, taxa de falhas, latência e consumo operacional dos dois perfis.
- Visualização no Cockpit, Chat e Computador, inclusive viewport móvel/PWA/APK.

## Próxima rodada recomendada

1. Configurar uma conta dedicada de teste e os secrets de repositório `PLUTAO_E2E_EMAIL` e `PLUTAO_E2E_PASSWORD`; não usar nem registrar credenciais pessoais no repositório.
2. Reexecutar o workflow autenticado e confirmar nos logs que o caso Playwright terminou `passed`, não `skipped`.
3. Executar o smoke serial multi-nó e os caminhos de Write Gate/retomada com dados de teste isolados; registrar referências de run, estados e evidências sanitizadas.
4. Conduzir o piloto controlado dos dois especialistas com tarefas representativas e sem escrita externa sem Write Gate. Guardar resultados sem tokens, dados pessoais ou payloads sensíveis.
5. Só após revisão dessas evidências decidir sobre paralelismo. Manter execução concorrente desativada até então; BrowserTool/ComputerTool também continuam fora desta tranche.

**Decisão operacional desta rodada:** nenhum teste autenticado adicional foi executado, nenhuma missão foi criada por este registro e nenhuma migration/dado de produção foi alterado.
