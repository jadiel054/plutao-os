/**
 * CONTROLLER DURÁVEL DE 3 ESTADOS (Parte 1.3 da 3ª auditoria).
 *
 * `durableControllerState` é a fonte da verdade do controle:
 *  - "agent"/"human": confirmado no store durável (vale entre instâncias);
 *  - "unknown": sem registro durável legível (nada enviado ao navegador).
 * Snapshots locais NUNCA substituem o estado durável.
 */
import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "../store";
import { ComputerSessionManager } from "../sessionManager";
import { fakeSession } from "./fakes";

const NOW = 1_700_000_000_000;

function buildManager(now: () => number, store: MemorySessionStore, instance: string): ComputerSessionManager {
  return new ComputerSessionManager({
    now,
    store,
    channelInstance: instance,
    providerFactory: () => ({
      kind: "browserless",
      isConfigured: () => true,
      limits: () => ({ maxSessionMs: 110_000, maxConcurrentSessions: 1, monthlyBudgetUnits: 1000, notes: [] }),
      createSession: ({ sessionId }) => Promise.resolve(fakeSession(sessionId ?? `fake-${instance}`, now)),
    }),
  });
}

describe("durableControllerState — agent | human | unknown", () => {
  it("agent confirmado no store durável", async () => {
    const now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const a = buildManager(() => now, store, "inst-A");
    const reserved = await a.reserve({ conversationId: "conv-1", userId: "user-1" });
    if (!reserved.ok) throw new Error("reserva deveria passar");
    expect(await a.durableControllerState("conv-1", "user-1")).toBe("agent");
  });

  it("human confirmado no store durável — inclusive por OUTRA instância", async () => {
    const now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const a = buildManager(() => now, store, "inst-A");
    const b = buildManager(() => now, store, "inst-B");
    const reserved = await a.reserve({ conversationId: "conv-1", userId: "user-1" });
    if (!reserved.ok) throw new Error("reserva deveria passar");
    expect((await b.takeHumanControl("conv-1", "user-1")).ok).toBe(true);
    expect(await a.durableControllerState("conv-1", "user-1")).toBe("human");
    expect(await b.durableControllerState("conv-1", "user-1")).toBe("human");
    expect(await b.isHumanInControlDurable("conv-1", "user-1")).toBe(true);
    expect((await a.releaseToAgent("conv-1", "user-1")).ok).toBe(true);
    expect(await b.durableControllerState("conv-1", "user-1")).toBe("agent");
  });

  it("sessão fechada/expirada → unknown (nada é enviado sem confirmação)", async () => {
    const now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const a = buildManager(() => now, store, "inst-A");
    const reserved = await a.reserve({ conversationId: "conv-1", userId: "user-1" });
    if (!reserved.ok) throw new Error("reserva deveria passar");
    await a.closeConversation("conv-1", "user-1");
    expect(await a.durableControllerState("conv-1", "user-1")).toBe("unknown");
  });

  it("outro usuário na mesma conversa → unknown (sem comandos)", async () => {
    const now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const a = buildManager(() => now, store, "inst-A");
    const reserved = await a.reserve({ conversationId: "conv-1", userId: "user-1" });
    if (!reserved.ok) throw new Error("reserva deveria passar");
    expect(await a.durableControllerState("conv-1", "user-2")).toBe("unknown");
  });
});
