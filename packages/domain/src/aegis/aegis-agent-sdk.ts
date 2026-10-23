/**
 * Aegis Agent SDK — minimal client for mission control heartbeats/commands.
 * Use from workers / API routes when a long-lived process is available.
 */

export type AegisConfig = {
  baseUrl: string;
  agentName: string;
  agentId?: string;
};

export async function aegisHeartbeat(
  cfg: AegisConfig,
  status: 'online' | 'offline' | 'error' = 'online',
  metadata?: Record<string, unknown>
) {
  const body: Record<string, unknown> = {
    status,
    name: cfg.agentName,
  };
  if (cfg.agentId) body.agent_id = cfg.agentId;
  if (metadata) body.metadata = metadata;

  const res = await fetch(`${cfg.baseUrl}/api/agents/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Aegis heartbeat failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
