import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-owner", email: "owner@plutao.test" };

vi.mock("@/lib/auth/session", () => ({
  getAuthOrGuestUser: vi.fn(async () => mockUser),
}));

vi.mock("@/app/api/conversations/[id]/route", () => ({
  checkConversationOwnership: vi.fn(async (id: string, userId: string) => {
    if (id === "missing" || id === "other" || userId !== mockUser.id) {
      return { status: 404, conversation: null };
    }
    return {
      status: 200,
      conversation: { id, userId: mockUser.id },
    };
  }),
}));

vi.mock("@/lib/events/appendConversationEvent", () => ({
  listConversationEvents: vi.fn(async () => ({
    events: [
      {
        id: "e1",
        conversationId: "conv-1",
        seq: 1,
        type: "user_message",
        source: "chat",
        payload: {},
        preview: "oi",
        artifactId: null,
        visibility: "llm",
        createdAt: "2026-09-28T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  })),
}));

import { getAuthOrGuestUser } from "@/lib/auth/session";
import { GET } from "../route";

function req(url: string) {
  return new Request(url) as unknown as import("next/server").NextRequest;
}

describe("GET /api/conversations/[id]/events", () => {
  beforeEach(() => {
    vi.mocked(getAuthOrGuestUser).mockResolvedValue(mockUser as never);
  });

  it("returns events for owner", async () => {
    const res = await GET(req("http://localhost/api/conversations/conv-1/events"), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(1);
    expect(json.events[0].seq).toBe(1);
  });

  it("returns 404 for other user's conversation", async () => {
    const res = await GET(req("http://localhost/api/conversations/other/events"), {
      params: Promise.resolve({ id: "other" }),
    });
    expect(res.status).toBe(404);
  });

  it("404 when missing", async () => {
    const res = await GET(req("http://localhost/api/conversations/missing/events"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthOrGuestUser).mockResolvedValue(null as never);
    const res = await GET(req("http://localhost/api/conversations/conv-1/events"), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(401);
  });
});
