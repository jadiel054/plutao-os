import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGuestSessionsDb: Array<{
  id: string;
  token: string;
  userId: string;
  ip: string;
  messageCount: number;
  firstMessageAt: Date | null;
  expiresAt: Date;
  convertedUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = [];

const mockUsersDb: Array<{
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
}> = [];

let throwDbError = false;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "plutao_guest_session") {
        return mockCookieToken ? { value: mockCookieToken } : undefined;
      }
      return undefined;
    },
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

let mockCookieToken: string | null = null;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: { name?: string }) => ({
        where: () => {
          if (throwDbError) {
            throw new Error("Neon Database Connection Error");
          }
          return {
            limit: () => {
              return mockGuestSessionsDb.filter((gs) => gs.token === mockCookieToken);
            },
          };
        },
      }),
    }),
    insert: () => ({
      values: (val: any) => ({
        returning: () => {
          if (val.email && val.email.includes("guest")) {
            const newUser = { id: `usr_${Date.now()}_${Math.random()}`, email: val.email, name: val.name, isGuest: true };
            mockUsersDb.push(newUser);
            return [{ id: newUser.id }];
          } else {
            const newSession = {
              id: `gst_sess_${Date.now()}_${Math.random()}`,
              token: val.token,
              userId: val.userId,
              ip: val.ip,
              messageCount: 0,
              firstMessageAt: null,
              expiresAt: val.expiresAt,
              createdAt: val.createdAt,
              updatedAt: val.updatedAt,
            };
            mockGuestSessionsDb.push(newSession);
            return [{ id: newSession.id }];
          }
        },
      }),
    }),
  }),
}));

import { getGuestSessionByToken, createGuestSession } from "../guest";
import { getAuthOrGuestUser } from "../session";

describe("Correções do Bug Crítico de Sessão Guest", () => {
  beforeEach(() => {
    mockGuestSessionsDb.length = 0;
    mockUsersDb.length = 0;
    mockCookieToken = null;
    throwDbError = false;
  });

  it("1. Leituras não criam usuários/sessões no banco (getAuthOrGuestUser retorna null quando anônimo)", async () => {
    const user = await getAuthOrGuestUser();
    expect(user).toBeNull();
    expect(mockGuestSessionsDb.length).toBe(0);
    expect(mockUsersDb.length).toBe(0);
  });

  it("2. Sessão guest nasce via POST/createGuestSession e leituras de getAuthOrGuestUser usam a mesma sessão", async () => {
    // Apenas POST /api/auth/guest (createGuestSession) cria sessão
    const created = await createGuestSession({ ip: "127.0.0.1" });
    expect(created.id).toBeDefined();
    expect(mockGuestSessionsDb.length).toBe(1);
    expect(mockUsersDb.length).toBe(1);

    // Simula cookie gravado no navegador
    mockCookieToken = created.token;

    // Leitura 1 via GET /api/auth/me
    const read1 = await getAuthOrGuestUser();
    expect(read1).not.toBeNull();
    expect(read1?.isGuest).toBe(true);
    expect(read1?.guestSession?.id).toBe(created.id);

    // Leitura 2 via GET /api/auth/me
    const read2 = await getAuthOrGuestUser();
    expect(read2).not.toBeNull();
    expect(read2?.guestSession?.id).toBe(created.id);

    // Nenhuma sessão nova foi criada no banco durante as 2 leituras
    expect(mockGuestSessionsDb.length).toBe(1);
    expect(mockUsersDb.length).toBe(1);
  });

  it("3. Erros de DB em getGuestSessionByToken falham explicitamente em vez de silenciar como null", async () => {
    mockCookieToken = "valid_token_123";
    throwDbError = true;

    await expect(getGuestSessionByToken("valid_token_123")).rejects.toThrow("Neon Database Connection Error");
  });

  it("4. secondsRemaining e messagesRemaining não reiniciam após refresh", async () => {
    const created = await createGuestSession({ ip: "127.0.0.1" });
    mockCookieToken = created.token;

    // Simula envio de 1ª mensagem há 2 minutos (120 segundos atrás)
    const twoMinAgo = new Date(Date.now() - 120 * 1000);
    const sessionInDb = mockGuestSessionsDb.find((s) => s.token === created.token);
    if (sessionInDb) {
      sessionInDb.messageCount = 2;
      sessionInDb.firstMessageAt = twoMinAgo;
    }

    // Chamada do servidor (equivalente ao refresh)
    const userMe = await getAuthOrGuestUser();
    expect(userMe?.guestSession?.messagesRemaining).toBe(8); // 10 - 2 = 8
    expect(userMe?.guestSession?.secondsRemaining).toBeLessThanOrEqual(780); // 900 - 120 = 780s
    expect(userMe?.guestSession?.secondsRemaining).toBeGreaterThan(770);
  });
});
