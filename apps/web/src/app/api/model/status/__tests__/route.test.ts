import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import * as sessionModule from "@/lib/auth/session";
import * as configModule from "@/lib/runtime/model/config";

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/runtime/model/config", () => ({
  getModelConfig: vi.fn(),
}));

describe("BUG 3 — Rota /api/model/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 401 se usuário não estiver autenticado", async () => {
    vi.spyOn(sessionModule, "getSessionUser").mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("deve retornar configured: false e label: null quando modelo não estiver configurado", async () => {
    vi.spyOn(sessionModule, "getSessionUser").mockResolvedValue({ id: "user-1" } as unknown as Awaited<ReturnType<typeof sessionModule.getSessionUser>>);
    vi.spyOn(configModule, "getModelConfig").mockReturnValue(null);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.configured).toBe(false);
    expect(data.label).toBeNull();
  });

  it("deve retornar o campo label amigável do modelo quando configurado", async () => {
    vi.spyOn(sessionModule, "getSessionUser").mockResolvedValue({ id: "user-1" } as unknown as Awaited<ReturnType<typeof sessionModule.getSessionUser>>);
    vi.spyOn(configModule, "getModelConfig").mockReturnValue({
      provider: "xai",
      model: "grok-4.6",
      apiKey: "secret",
      baseUrl: "https://api.x.ai/v1",
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.configured).toBe(true);
    expect(data.provider).toBe("xai");
    expect(data.model).toBe("grok-4.6");
    expect(data.label).toBeDefined();
    expect(typeof data.label).toBe("string");
  });
});
