# Evidência operacional do worker durável — 08/10/2026

**Ambiente:** [https://plutao-os.vercel.app](https://plutao-os.vercel.app)
**Código publicado:** merge commit `aecd0f5` do [PR #137](https://github.com/jadiel054/plutao-os/pull/137)
**Deployment Vercel:** `6924042064` — produção, concluído com sucesso
**Workflow:** [Durable runtime worker — run 37714749846](https://github.com/jadiel054/plutao-os/actions/runs/37714749846)

## Resultado

O workflow autenticado chamou `POST /api/cron/runtime-worker` usando `CRON_SECRET` e recebeu HTTP `200` com:

```json
{"ok":true,"reconciled":1,"processed":[],"durationMs":1868}
```

A resposta demonstra que:

- o secret do GitHub Actions está configurado e aceito pela Vercel;
- a rota de worker está publicada e alcançável;
- o banco e a fila durável responderam ao processamento;
- uma divergência terminal antiga foi reconciliada (`reconciled: 1`);
- não havia job pendente para executar naquele disparo (`processed: []`).

## Limites da evidência

Este probe **não** comprova uma missão autenticada completa. Ele não criou missão, não executou modelo, não percorreu um grafo de dois nós, não abriu um Write Gate e não validou a retomada no PWA/APK. Esses cenários continuam pendentes e exigem conta de teste dedicada, roteiro controlado e evidência sem segredos.

O PR de continuação adiciona `GET /api/cron/runtime-worker/health`, uma consulta read-only de contagens agregadas e leases expirados, além de executar esse probe antes do POST no cron periódico. A nova rota deve ser validada depois do deploy do PR.
