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
let mockCookieToken: string | null = null;

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

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: unknown) => ({
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
      values: (val: Record<string, unknown>) => ({
        returning: () => {
          const emailVal = typeof val.email === "string" ? val.email : "";
          if (emailVal.includes("guest")) {
            const newUser = {
              id: `usr_${Date.now()}_${Math.random()}`,
              email: emailVal,
              name: String(val.name ?? ""),
              isGuest: true,
            };
            mockUsersDb.push(newUser);
            return [{ id: newUser.id }];
          }
          const newSession = {
            id: `gst_sess_${Date.now()}_${Math.random()}`,
            token: String(val.token ?? ""),
            userId: String(val.userId ?? ""),
            ip: String(val.ip ?? "127.0.0.1"),
            messageCount: 0,
            firstMessageAt: null as Date | null,
            expiresAt: (val.expiresAt as Date) || new Date(),
            createdAt: (val.createdAt as Date) || new Date(),
            updatedAt: (val.updatedAt as Date) || new Date(),
          };
          mockGuestSessionsDb.push(newSession);
          return [{ id: newSession.id }];
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

  it("1. Leituras anônimas não criam usuários/sessões no banco", async () => {
    const user = await getAuthOrGuestUser();
    expect(user).toBeNull();
    expect(mockGuestSessionsDb.length).toBe(0);
    expect(mockUsersDb.length).toBe(0);
  });

  it("2. Sessão guest nasce via createGuestSession; leituras reusam a mesma sessão", async () => {
    const created = await createGuestSession({ ip: "127.0.0.1" });
    expect(created.id).toBeDefined();
    expect(mockGuestSessionsDb.length).toBe(1);
    expect(mockUsersDb.length).toBe(1);

    mockCookieToken = created.token;

    const read1 = await getAuthOrGuestUser();
    expect(read1).not.toBeNull();
    expect(read1?.isGuest).toBe(true);
    expect(read1?.guestSession?.id).toBe(created.id);

    const read2 = await getAuthOrGuestUser();
    expect(read2?.guestSession?.id).toBe(created.id);
    expect(mockGuestSessionsDb.length).toBe(1);
    expect(mockUsersDb.length).toBe(1);
  });

  it("3. Erros de DB em getGuestSessionByToken falham explicitamente", async () => {
    mockCookieToken = "valid_token_123";
    throwDbError = true;
    await expect(getGuestSessionByToken("valid_token_123")).rejects.toThrow(
      "Neon Database Connection Error"
    );
  });

  it("4. secondsRemaining e messagesRemaining não reiniciam após refresh", async () => {
    const created = await createGuestSession({ ip: "127.0.0.1" });
    mockCookieToken = created.token;

    const twoMinAgo = new Date(Date.now() - 120 * 1000);
    const sessionInDb = mockGuestSessionsDb.find((s) => s.token === created.token);
    if (sessionInDb) {
      sessionInDb.messageCount = 2;
      sessionInDb.firstMessageAt = twoMinAgo;
    }

    const userMe = await getAuthOrGuestUser();
    expect(userMe?.guestSession?.messagesRemaining).toBe(8);
    expect(userMe?.guestSession?.secondsRemaining).toBeLessThanOrEqual(780);
    expect(userMe?.guestSession?.secondsRemaining).toBeGreaterThan(770);
  });
});
