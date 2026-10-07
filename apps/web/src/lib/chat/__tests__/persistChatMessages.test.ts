import { beforeEach, describe, expect, it, vi } from "vitest";

const emitOrder: string[] = [];

vi.mock("@/lib/events/appendConversationEvent", () => ({
  emitUserMessage: vi.fn(async () => {
    emitOrder.push("user");
  }),
  emitAssistantMessage: vi.fn(async () => {
    emitOrder.push("assistant");
  }),
}));

vi.mock("@plutao/db", () => ({
  conversations: { id: "id" },
  messages: {},
}));

const insertValues = vi.fn(async () => undefined);
const updateSet = vi.fn(() => ({ where: async () => undefined }));

import { emitUserMessage, emitAssistantMessage } from "@/lib/events/appendConversationEvent";
import { persistMessagePair } from "../persistChatMessages";

describe("persistMessagePair events (G2 wiring)", () => {
  beforeEach(() => {
    emitOrder.length = 0;
    vi.clearAllMocks();
  });

  it("emits user then assistant in order", async () => {
    const db = {
      insert: () => ({ values: insertValues }),
      update: () => ({ set: updateSet }),
    };

    await persistMessagePair(db as never, "conv-1", "oi", "olá");
    await new Promise((r) => setTimeout(r, 30));

    expect(insertValues).toHaveBeenCalled();
    expect(emitUserMessage).toHaveBeenCalledWith("conv-1", "oi");
    expect(emitAssistantMessage).toHaveBeenCalledWith("conv-1", "olá");
    expect(emitOrder).toEqual(["user", "assistant"]);
  });

  it("skips when conversationId is null", async () => {
    await persistMessagePair({} as never, null, "a", "b");
    expect(emitUserMessage).not.toHaveBeenCalled();
  });

  it("sanitiza credenciais antes de persistir mensagens", async () => {
    const db = {
      insert: () => ({ values: insertValues }),
      update: () => ({ set: updateSet }),
    };
    const secret = "sk_live_TESTSECRET123456";

    await persistMessagePair(db as never, "conv-1", `chave ${secret}`, `retorno ${secret}`);
    await new Promise((r) => setTimeout(r, 30));

    const insertedCalls = insertValues.mock.calls as unknown as Array<[Array<{ content: string }>]>;
    const inserted = insertedCalls.at(-1)?.[0];
    expect(JSON.stringify(inserted)).not.toContain(secret);
    expect(emitUserMessage).toHaveBeenCalledWith("conv-1", expect.not.stringContaining(secret));
    expect(emitAssistantMessage).toHaveBeenCalledWith("conv-1", expect.not.stringContaining(secret));
  });
});
