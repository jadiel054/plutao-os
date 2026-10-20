# Executores de automação do Plutão OS

Este documento descreve a camada de executores assíncronos integrada ao Plutão. O Plutão continua sendo o orquestrador: valida ownership, aplica specialist policy, exige capability registrada, cria Write Gate quando a operação tem efeito externo, persiste a task, dispara o workflow e transforma o resultado em evidence. Nenhum executor recebe credenciais do usuário no prompt.

## ARTEMIS

O executor ARTEMIS está pinado no commit `351ca8422f7b5b54e80a9c1ce03a222e02415b6b` do repositório `google/artemis`. O comando real verificado no código é:

```bash
uv run artemis run "<goal>" \
  --profile flash \
  --test-name <nonce> \
  --traces-path <directory> \
  --with-video-recording-tools
```

A seleção do aparelho não é uma flag do comando: o CLI lê `ADB_DEVICE_SERIAL`/configuração ADB e o workflow define esse valor depois de conectar o hostname Tailscale na porta `5555`. O workflow também instala `adb`, `scrcpy`, `ffmpeg`, Python 3.12 e `uv`, e envia traces/logs/screenshot artifacts com retenção de sete dias.

Configure no ambiente server-side do Vercel e nos secrets do GitHub: `ARTEMIS_ENABLED=true`, `ARTEMIS_GH_PAT` (fine-grained, somente Actions no repositório), `ARTEMIS_GITHUB_REPOSITORY` opcional, `ARTEMIS_WORKFLOW_FILE` opcional, `ARTEMIS_GITHUB_REF` opcional, `ARTEMIS_DEFAULT_DEVICE` opcional, `TAILSCALE_AUTHKEY`, `GEMINI_API_KEY` e `CRON_SECRET`. O PAT nunca é lido pelo browser e não é o token OAuth do conector GitHub do usuário.

No Android físico, habilite Developer Options e Wireless debugging, faça o pareamento ADB sobre a rede Tailscale e confirme que `adb connect <hostname>:5555` funciona a partir de um runner autorizado. Em produção, use um aparelho dedicado e uma conta de teste. O Plutão mantém no máximo uma task `pending`/`running` por device.

## Maestro

Maestro Mobile é o executor determinístico recomendado para fluxos declarativos e regressão. Os fluxos devem ser versionados no repositório e o job deve receber YAML materializado; o modelo não deve enviar shell arbitrário. O workflow instala o CLI oficial, executa `maestro test` e publica JUnit/logs/screenshots. Maestro é apropriado para smoke tests e caminhos conhecidos, enquanto ARTEMIS é apropriado para exploração visual.

## Appium

Appium é o executor programático para suites que precisam de ações estruturadas e inspeção de acessibilidade. O adaptador deve usar UiAutomator2 para Android, manter capabilities allowlisted e publicar screenshots/logs como artifacts. O usuário fornece uma sequência JSON de ações validada pelo Plutão, nunca JavaScript arbitrário. Use Appium quando Maestro não oferecer a flexibilidade necessária.

## Playwright

Playwright é o executor web. O Plutão deve usar um browser context isolado por task, tracing opcional, screenshots em cada etapa e um allowlist de URLs/domínios. Ele é usado para validação de sites e deployments Vercel, incluindo smoke checks após publicação. A pesquisa avançada na web passa por uma tarefa de browser com limites de domínio, tempo e tamanho de conteúdo; resultados são evidence e não autorização para escrever em sites.

## AndroidWorld

AndroidWorld é mantido como executor de avaliação. Ele mede taxa de sucesso e regressão do agente em tarefas Android padronizadas; não é o caminho de produção para controlar a conta mobile do usuário. Os resultados incluem tarefa, seed, sucesso/falha, duração e logs. O workflow é separado do executor ARTEMIS para que benchmark não seja confundido com evidence de uma missão operacional.

## Lifecycle comum

```text
tool → capability registry → write gate, se necessário → task pending
     → GitHub workflow_dispatch com nonce → running
     → cron poller → artifact privado no Vercel Blob
     → task terminal → EvidenceItem + conversation events
```

Tasks são idempotentes por `nonce`, possuem ownership por `userId`, lock lógico por device quando aplicável, timeout e cancelamento. Artifacts não são publicados diretamente: o poller cria uma linha em `artifacts` com Blob privado e a evidence aponta para `/api/artifacts/:id/content`, rota que valida a sessão e ownership.

## Verificação operacional

1. Habilite a feature flag apenas em um ambiente de preview.
2. Dispare manualmente `ARTEMIS Android executor` com uma tarefa de leitura em Settings.
3. Confirme screenshots e JSON em `artemis-traces-<nonce>`.
4. Crie uma task pelo Plutão e confirme `pending → running → done` no painel.
5. Verifique o link privado de artifact pela sessão do mesmo usuário.
6. Só depois habilite o cron `ARTEMIS poller` e os demais executores para missões reais.
