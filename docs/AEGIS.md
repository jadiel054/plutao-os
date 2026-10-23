# Aegis integration (Plutão)

Mission control: https://aegis-control-sand.vercel.app

## Heartbeat

GitHub Action `.github/workflows/aegis-heartbeat.yml` pings Aegis every 2 minutes as agent **Plutao**.

Optional repo variable:
- `AEGIS_BASE_URL` (default `https://aegis-control-sand.vercel.app`)

## SDK

`packages/domain/src/aegis/aegis-agent-sdk.ts` — call `aegisHeartbeat()` from durable workers when available.

## Commands

Aegis can dispatch `restart | redeploy | run_diagnostic | custom` to agents with a `webhook_url`.
Configure Plutão webhook in the Aegis agents table when an HTTP endpoint is ready.
