import { beforeEach, describe, expect, it, vi } from "vitest";

const emitOrder: string[] = [];

vi.mock("@/lib/events/appendConversationEvent", () => ({
  emitUserMessage: vi.fn(async () => {
    emitOrder.push("user");
    return { seq: emitOrder.length };
  }),
  emitAssistantMessage: vi.fn(async () => {
    emitOrder.push("assistant");
    return { seq: emitOrder.length };
  }),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [
          { id: "u1", role: "user" },
          { id: "a1", role: "assistant" },
        ],
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
  })),
}));

vi.mock("@/lib/runtime/model/config", () => ({
  getModelConfig: () => ({ provider: "xai", apiModel: "test" }),
}));

vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: async () => ({ content: "ok" }),
}));

vi.mock("@/lib/mcp/auth", () => ({
  hasMcpScope: () => true,
  getMcpAuth: () => ({ userId: "u", clientId: "c", grantId: "g" }),
}));

vi.mock("@/lib/mcp/audit", () => ({
  checkMcpRateLimit: () => ({ ok: true }),
  writeMcpAudit: async () => undefined,
}));

import { emitUserMessage, emitAssistantMessage } from "@/lib/events/appendConversationEvent";
import { toolSendMessage } from "../tools";

describe("H1 toolSendMessage event order", () => {
  beforeEach(() => {
    emitOrder.length = 0;
    vi.clearAllMocks();
  });

  it("emits user_message before assistant_message (sequential await)", async () => {
    // Force conversationId path with ownership: mock returns empty → create path
    // Our getDb mock creates conversation and messages.
    const result = await toolSendMessage("user-1", {
      content: "Teste de ordenação H1",
    });

    expect(result.isError).toBeFalsy();

    // Allow microtask chain to finish
    await new Promise((r) => setTimeout(r, 20));

    expect(emitUserMessage).toHaveBeenCalled();
    expect(emitAssistantMessage).toHaveBeenCalled();
    expect(emitOrder).toEqual(["user", "assistant"]);
  });
});
