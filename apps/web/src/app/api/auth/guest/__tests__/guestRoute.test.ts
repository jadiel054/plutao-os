import { describe, it, expect, vi } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/guest", () => ({
  createGuestSession: vi.fn().mockImplementation(async (opts: { ip?: string }) => {
    if (opts.ip === "10.0.0.99") {
      const { GuestRateLimitError } = await import("@/lib/auth/guest");
      throw new GuestRateLimitError("Limite excedido de IP");
    }
    return {
      id: "gst_session_123",
      token: "gst_token_123",
      userId: "user_guest_123",
      messageCount: 0,
      firstMessageAt: null,
      expiresAt: new Date(),
      isLimitReached: false,
      messagesRemaining: 10,
      secondsRemaining: 900,
    };
  }),
  GuestRateLimitError: class GuestRateLimitError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "GuestRateLimitError";
    }
  },
}));

describe("POST /api/auth/guest", () => {
  it("deve criar uma sessão de convidado e retornar HTTP 200", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/guest", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.guestSession).toBeDefined();
    expect(data.guestSession.id).toBe("gst_session_123");
  });

  it("deve retornar HTTP 429 se o rate limit por IP for excedido", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/guest", {
      method: "POST",
      headers: {
        "x-forwarded-for": "10.0.0.99",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data.error).toBe("Limite excedido de IP");
  });
});
