import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/lib/mcp/audit", () => ({
  checkMcpRateLimit: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth/session";
import { checkMcpRateLimit } from "@/lib/mcp/audit";
import { getDb } from "@/lib/db";
import { POST } from "../route";

function post(body: unknown) {
  return new Request("http://localhost/api/chat/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/feedback", () => {
  beforeEach(() => {
    vi.mocked(checkMcpRateLimit).mockResolvedValue({ ok: true });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await POST(post({ rating: "up", messageId: "m", conversationId: "c" }));
    expect(res.status).toBe(401);
  });

  it("rejects invalid rating", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as never);
    const res = await POST(post({ rating: "meh", messageId: "m", conversationId: "c" }));
    expect(res.status).toBe(400);
  });

  it("requires messageId and conversationId", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as never);
    const res = await POST(post({ rating: "up" }));
    expect(res.status).toBe(400);
  });
});
