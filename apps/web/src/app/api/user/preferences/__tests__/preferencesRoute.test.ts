import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "../route";
import { NextRequest } from "next/server";
import { PRESET_MODELS } from "@plutao/domain";

// Mock do auth session
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-123", email: "test@example.com" }),
  AuthError: class AuthError extends Error {},
}));

// Mock do db
const mockUserRecord = {
  id: "user-123",
  preferences: { onboarding_seen: true },
  preferredModel: "groq/gpt-oss-120b",
};

vi.mock("@/lib/db", () => {
  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUserRecord]),
          }),
        }),
      }),
      update: () => ({
        set: (fields: Record<string, unknown>) => {
          if (fields.preferredModel) {
            mockUserRecord.preferredModel = fields.preferredModel as string;
          }
          if (fields.preferences) {
            mockUserRecord.preferences = fields.preferences as { onboarding_seen: boolean };
          }
          return {
            where: () => ({
              returning: vi.fn().mockResolvedValue([
                {
                  preferences: mockUserRecord.preferences,
                  preferredModel: mockUserRecord.preferredModel,
                },
              ]),
            }),
          };
        },
      }),
    }),
  };
});

describe("API /api/user/preferences — preferredModel server-side", () => {
  beforeEach(() => {
    mockUserRecord.preferredModel = "groq/gpt-oss-120b";
  });

  it("GET retorna preferências e preferredModel gravado", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.preferredModel).toBe("groq/gpt-oss-120b");
    expect(data.preferences).toEqual({ onboarding_seen: true });
  });

  it("PATCH grava preferredModel quando válido no PRESET_MODELS", async () => {
    const validModel = PRESET_MODELS[0].id;
    const req = new NextRequest("http://localhost/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredModel: validModel }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.preferredModel).toBe(validModel);
    expect(mockUserRecord.preferredModel).toBe(validModel);
  });

  it("PATCH rejeita preferredModel inexistente com HTTP 400", async () => {
    const req = new NextRequest("http://localhost/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredModel: "invalid/non-existent-model-id" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Modelo preferido inválido");
  });
});
