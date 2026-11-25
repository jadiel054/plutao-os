import type { ComputerSession } from "../provider";

/**
 * Fake MINIMALISTA de ComputerSession para testes de control plane (sem rede).
 * Fiel ao contrato: snapshot/connectionInfo/compareAndSetController/execute...
 */
export function fakeSession(id: string, now: () => number): ComputerSession {
  let controller: "agent" | "human" = "agent";
  return {
    id,
    provider: "browserless",
    snapshot: () => ({
      sessionId: id,
      provider: "browserless",
      status: "ready" as const,
      controller,
      createdAt: now(),
      leaseExpiresAt: now() + 110_000,
      lastSeenAt: now(),
      unitsUsed: 0,
      error: null,
    }),
    connectionInfo: (screenEndpoint, inputEndpoint) => ({
      sessionId: id,
      provider: "browserless",
      status: "ready" as const,
      controller,
      screenTransport: "sse-screencast-proxy" as const,
      screenEndpoint,
      inputEndpoint,
    }),
    compareAndSetController: (from, to) => {
      if (controller !== from) return false;
      controller = to;
      return true;
    },
    executeAction: async () => undefined,
    subscribeScreen: () => () => undefined,
    getLastFrame: () => null,
    reconnect: async () => undefined,
    close: async () => void 0,
  } as ComputerSession;
}
