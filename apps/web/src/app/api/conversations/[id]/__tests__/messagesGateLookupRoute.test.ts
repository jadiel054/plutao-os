import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getAuthOrGuestUser: vi.fn().mockResolvedValue({
    id: "user-123",
    email: "test@plutao.app",
    isGuest: false,
  }),
}));

const mockWriteGates = [
  {
    id: "12345678-1234-1234-1234-123456789abc",
    userId: "user-123",
    provider: "github",
    capability: "repo_create",
    status: "executed",
    expiresAt: new Date(Date.now() + 60000),
    result: { output: "Repositório criado com sucesso no GitHub." },
    error: null,
  },
];

const mockMessages = [
  {
    id: "msg-1",
    conversationId: "conv-100",
    role: "assistant",
    content: "Ação de escrita solicitada.",
    metadata: {
      steps: [
        {
          type: "tool_call",
          toolCall: {
            id: "tc-1",
            provider: "github",
            capability: "repo_create",
            status: "GATE_PENDING",
            summaryOutput:
              "GATE_PENDING\ngate_id: 12345678-1234-1234-1234-123456789abc\ncapability: repo_create",
          },
        },
      ],
    },
    createdAt: new Date().toISOString(),
  },
];

vi.mock("@plutao/db", () => {
  return {
    conversations: { id: "conversations_id", userId: "conversations_userId" },
    messages: {
      id: "messages_id",
      conversationId: "messages_conversationId",
      createdAt: "messages_createdAt",
    },
    writeGates: {
      id: "writeGates_id",
      userId: "writeGates_userId",
      status: "writeGates_status",
      expiresAt: "writeGates_expiresAt",
      result: "writeGates_result",
      error: "writeGates_error",
    },
  };
});

vi.mock("@/lib/db", () => {
  return {
    getDb: () => ({
      select: vi.fn().mockImplementation((fields?: unknown) => ({
        from: vi.fn().mockImplementation((table: { id?: string }) => {
          if (table?.id === "conversations_id") {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockResolvedValue([{ id: "conv-100", userId: "user-123" }]),
              })),
            };
          }
          if (table?.id === "writeGates_id") {
            return {
              where: vi.fn().mockResolvedValue(mockWriteGates),
            };
          }
          return {
            where: vi.fn().mockImplementation(() => ({
              orderBy: vi.fn().mockResolvedValue(mockMessages),
            })),
          };
        }),
      })),
    }),
  };
});

import { GET } from "@/app/api/conversations/[id]/messages/route";
import { NextRequest } from "next/server";

describe("GET /api/conversations/[id]/messages write-gate lookup integration test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries writeGates selectively by gateId and userId, returning reconstructed gate status without payload or payloadHash", async () => {
    const req = new NextRequest("http://localhost:3000/api/conversations/conv-100/messages");
    const res = await GET(req, { params: Promise.resolve({ id: "conv-100" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toBeDefined();
    expect(json.messages.length).toBe(1);

    const reloadedMsg = json.messages[0];
    const steps = reloadedMsg.metadata.steps;
    expect(steps).toBeDefined();
    expect(steps.length).toBe(1);

    expect(steps[0].toolCall.status).toBe("executed");
    expect(steps[0].toolCall.summaryOutput).toContain("Repositório criado com sucesso");

    const jsonString = JSON.stringify(json);
    expect(jsonString).not.toContain("payloadHash");
    expect(jsonString).not.toContain("payload");
  });
});
