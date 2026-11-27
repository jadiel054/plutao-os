import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de contrato do POST /api/missions/:id/link-conversation.
 * Auth, ownership, idempotência, conflito de troca e persistência.
 */

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  mission: null as Record<string, unknown> | null,
  ownedConversations: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
  updateShouldFail: false,
  emitted: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
}));

vi.mock("@/lib/missions/ownership", () => ({
  getOwnedMission: async (_missionId: string, userId: string) => {
    if (!state.mission) return null;
    if (state.mission.userId !== userId) return null;
    return state.mission;
  },
  getOwnedConversation: async (conversationId: string, userId: string) => {
    if (!state.ownedConversations.includes(conversationId)) return null;
    // ownership checa dono real no banco; aqui a lista já é do usuário
    return state.user && state.user.id === userId ? { id: conversationId } : null;
  },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (state.updateShouldFail) return [];
            state.updates.push(vals);
            state.mission = { ...state.mission, ...vals };
            return [{ conversationId: vals.conversationId }];
          },
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/events/missionEventEmitter", () => ({
  emitMissionEvent: async (opts: Record<string, unknown>) => {
    state.emitted.push(opts);
    return {} as never;
  },
}));

import { POST } from "../route";

const USER = "11111111-1111-1111-1111-111111111111";
const MISSION = "22222222-2222-2222-2222-222222222222";
const CONV_A = "33333333-3333-3333-3333-333333333333";
const CONV_B = "44444444-4444-4444-4444-444444444444";

function call(body: unknown, id = MISSION) {
  const req = { json: async () => body } as never;
  const ctx = { params: Promise.resolve({ id }) };
  return POST(req as never, ctx as never);
}

describe("POST /api/missions/:id/link-conversation", () => {
  beforeEach(() => {
    state.user = { id: USER };
    state.mission = { id: MISSION, userId: USER, conversationId: null };
    state.ownedConversations = [CONV_A, CONV_B];
    state.updates.length = 0;
    state.updateShouldFail = false;
    state.emitted.length = 0;
  });

  it("401 sem sessão", async () => {
    state.user = null;
    const res = await call({ conversationId: CONV_A });
    expect(res.status).toBe(401);
  });

  it("404 para missão inexistente ou de outro usuário", async () => {
    state.mission = null;
    expect((await call({ conversationId: CONV_A })).status).toBe(404);
    state.mission = { id: MISSION, userId: "other-user", conversationId: null };
    expect((await call({ conversationId: CONV_A })).status).toBe(404);
  });

  it("400 sem conversationId e 404 para conversa de outro usuário", async () => {
    expect((await call({})).status).toBe(400);
    state.ownedConversations = [];
    expect((await call({ conversationId: CONV_A })).status).toBe(404);
  });

  it("persiste o vínculo e emite evento mission_linked", async () => {
    const res = await call({ conversationId: CONV_A });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.alreadyLinked).toBe(false);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].conversationId).toBe(CONV_A);
    expect(state.emitted).toHaveLength(1);
    expect(state.emitted[0].phase).toBe("linked");
  });

  it("retry com o mesmo vínculo é idempotente (não atualiza de novo)", async () => {
    await call({ conversationId: CONV_A });
    const res = await call({ conversationId: CONV_A });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyLinked).toBe(true);
    expect(state.updates).toHaveLength(1);
  });

  it("troca de vínculo é recusada com 409 (sem atualização)", async () => {
    await call({ conversationId: CONV_A });
    const res = await call({ conversationId: CONV_B });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("MISSION_ALREADY_LINKED");
    expect(state.updates).toHaveLength(1);
  });

  it("falha de persistência retorna 500 e não emite evento", async () => {
    state.updateShouldFail = true;
    const res = await call({ conversationId: CONV_A });
    expect(res.status).toBe(500);
    expect(state.emitted).toHaveLength(0);
  });
});
