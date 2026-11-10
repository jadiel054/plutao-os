import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { insert: vi.fn() },
  chatCompletion: vi.fn(),
  persistMessagePair: vi.fn(),
  loadAgentIdentity: vi.fn(),
  getModelConfig: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/runtime/model/config", () => ({ getModelConfig: mocks.getModelConfig }));
vi.mock("@/lib/runtime/model/client", () => ({ chatCompletion: mocks.chatCompletion }));
vi.mock("@/lib/agente/identity", () => ({
  loadAgentIdentity: mocks.loadAgentIdentity,
  buildIdentityBlock: () => "Plutão identity",
}));
vi.mock("@/lib/chat/persistChatMessages", () => ({ persistMessagePair: mocks.persistMessagePair }));
vi.mock("../auth", () => ({
  getMcpAuth: () => ({ userId: "user-1", scopes: ["mcp:read", "mcp:write"], clientId: "client-1", grantId: "grant-1", method: "oauth" }),
}));

import { toolSendMessage } from "../tools";

describe("toolSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const returning = vi.fn().mockResolvedValue([{ id: "conversation-1" }]);
    mocks.db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning }),
    });
    mocks.getModelConfig.mockReturnValue({ provider: "xai", apiKey: "test", model: "grok", baseUrl: "https://example.test" });
    mocks.loadAgentIdentity.mockResolvedValue({});
    mocks.chatCompletion.mockResolvedValue({
      content: "Olá, posso ajudar.",
      toolProposal: { name: "github_write", input: "do something" },
      provider: "xai",
      model: "grok",
      latencyMs: 1,
    });
    mocks.persistMessagePair.mockResolvedValue(undefined);
  });

  it("creates a conversation and persists text without executing a model tool proposal", async () => {
    const response = await toolSendMessage("user-1", { content: "Oi, Plutão" });
    const result = JSON.parse(response.content[0].text);

    expect(result).toMatchObject({
      conversationId: "conversation-1",
      assistant: "Olá, posso ajudar.",
      connectorActionsExecuted: false,
    });
    expect(mocks.chatCompletion).toHaveBeenCalledOnce();
    expect(mocks.persistMessagePair).toHaveBeenCalledWith(
      mocks.db,
      "conversation-1",
      "Oi, Plutão",
      "Olá, posso ajudar.",
      { source: "mcp", client_id: "client-1" }
    );
    expect(mocks.db.insert).toHaveBeenCalledOnce();
  });
});
