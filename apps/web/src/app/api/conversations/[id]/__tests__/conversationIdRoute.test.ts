import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-owner", email: "owner@plutao.test" };
const otherUserId = "user-other";

const convOwned = {
  id: "conv-1",
  userId: mockUser.id,
  title: "Qual o status do sistema?",
  isPinned: false,
  projectId: null,
  shareToken: null,
  createdAt: new Date("2026-09-28T00:15:40.987Z"),
  updatedAt: new Date("2026-09-28T00:15:41.809Z"),
};

const convOther = {
  ...convOwned,
  id: "conv-other",
  userId: otherUserId,
  title: "Alheia",
};

let store: typeof convOwned[] = [];

vi.mock("@/lib/auth/session", () => ({
  getAuthOrGuestUser: vi.fn(async () => mockUser),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async (n: number) => store.slice(0, n),
        }),
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            const row = store.find((c) => c.userId === mockUser.id);
            if (!row) return [];
            Object.assign(row, data);
            return [row];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        store = store.filter((c) => !(c.id === convOwned.id && c.userId === mockUser.id));
        return [];
      },
    }),
  }),
}));

// drizzle eq/and are identity for our mock path
vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
}));

vi.mock("@plutao/db", () => ({
  conversations: {
    id: "id",
    userId: "userId",
    title: "title",
    isPinned: "isPinned",
    projectId: "projectId",
    shareToken: "shareToken",
    updatedAt: "updatedAt",
  },
}));

import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership, PATCH, DELETE } from "../route";

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/conversations/conv-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as import("next/server").NextRequest;
}

describe("checkConversationOwnership", () => {
  beforeEach(() => {
    store = [{ ...convOwned }];
  });

  it("returns 200 for owner", async () => {
    const r = await checkConversationOwnership("conv-1", mockUser.id);
    expect(r.status).toBe(200);
    expect(r.conversation?.id).toBe("conv-1");
  });

  it("returns 404 for other user when row exists with different userId", async () => {
    store = [{ ...convOther }];
    const r = await checkConversationOwnership("conv-other", mockUser.id);
    expect(r.status).toBe(404);
    expect(r.conversation).toBeNull();
  });

  it("returns 404 when empty", async () => {
    store = [];
    const r = await checkConversationOwnership("missing", mockUser.id);
    expect(r.status).toBe(404);
  });
});

describe("PATCH /api/conversations/[id]", () => {
  beforeEach(() => {
    store = [{ ...convOwned }];
    vi.mocked(getAuthOrGuestUser).mockResolvedValue(mockUser as never);
  });

  it("renames owned conversation", async () => {
    const res = await PATCH(req("PATCH", { title: "Novo título" }), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversation.title).toBe("Novo título");
  });

  it("pins owned conversation", async () => {
    const res = await PATCH(req("PATCH", { isPinned: true }), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversation.isPinned).toBe(true);
  });

  it("rejects unauthenticated", async () => {
    vi.mocked(getAuthOrGuestUser).mockResolvedValue(null as never);
    const res = await PATCH(req("PATCH", { title: "x" }), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 on patch for another user's conversation", async () => {
    store = [{ ...convOther }];
    const res = await PATCH(req("PATCH", { title: "hack" }), {
      params: Promise.resolve({ id: "conv-other" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/conversations/[id]", () => {
  beforeEach(() => {
    store = [{ ...convOwned }];
    vi.mocked(getAuthOrGuestUser).mockResolvedValue(mockUser as never);
  });

  it("hard-deletes owned conversation", async () => {
    const res = await DELETE(req("DELETE"), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(store.find((c) => c.id === "conv-1")).toBeUndefined();
  });

  it("returns 404 on delete for another user's conversation", async () => {
    store = [{ ...convOther }];
    const res = await DELETE(req("DELETE"), {
      params: Promise.resolve({ id: "conv-other" }),
    });
    expect(res.status).toBe(404);
    expect(store).toHaveLength(1);
  });
});
