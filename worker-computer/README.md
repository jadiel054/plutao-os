# Onda 2 — Computador persistente do Plutão (mini PC, US$ 0/mês)

Kit de implantação do **worker CDP persistente** no mini PC próprio. O
adaptador `self-hosted` do Plutão (`apps/web/src/lib/computer/providers/self-hosted.ts`)
já fala o mesmo protocolo CDP do Browserless — trocar de provedor é apenas
configuração de ambiente, sem mudar Chat, UI ou sessionManager.

## Componentes

- `docker-compose.yml`: sobe o browserless open-source (rota `/chromium`) com
  **perfil persistente em volume** — o estado do navegador sobrevive a
  reinícios (o que o plano Free do Browserless não oferece), token próprio,
  1 navegador simultâneo e healthcheck.
- `egress-setup.sh`: **política de egress de REDE** (a garantia dura contra
  SSRF/DNS rebinding): bloqueia loopback, redes privadas, link-local/metadata
  e ranges reservados no nível de pacote para o usuário dedicado do Chromium.
- Heartbeat/reattach: a coordenação entre instâncias Vercel e o mini PC já é
  feita pelo control plane durável (`computer_sessions`, migration 0031) —
  leases de canal com failover por expiração; sessões órfãs do Chromium são
  limpas pelo TIMEOUT do browserless e pelo `sweepExpired` do store.

## Passo a passo

1. No mini PC: criar usuário dedicado (`useradd -m browser`) e rodar
   `sudo ./egress-setup.sh` (persistir com `netfilter-persistent save`).
2. `WORKER_TOKEN=<token-forte> docker compose up -d`.
3. Expor apenas via túnel autenticado (Tailscale/WireGuard). NUNCA abrir a
   porta 3000 diretamente na internet.
4. No Vercel:
   ```
   PLUTAO_COMPUTER_PROVIDER=self-hosted
   SELF_HOSTED_COMPUTER_ENDPOINT=wss://<mini-pc>:3000/chromium
   SELF_HOSTED_COMPUTER_TOKEN=<mesmo token>
   SELF_HOSTED_MAX_SESSION_MS=1800000
   ```
5. Validar: criar sessão, navegar página pública, receber frames, input,
   takeover durante ação longa, release com contexto, retomada e reinício do
   container preservando o estado da página (persistência real).

## Limitações honestas

- Persistência do perfil = cookies/localStorage; conexão CDP em si não
  sobrevive a restart do container (a retomada reabre com o MESMO id durável).
- O egress de rede cobre os processos do usuário dedicado; processos de
  outros usuários seguem as regras deles.
