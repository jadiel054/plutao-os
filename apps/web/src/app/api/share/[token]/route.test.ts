import { beforeEach, describe, expect, it, vi } from "vitest";

const tables = vi.hoisted(() => ({
  conversations: { id: "conversation.id", shareToken: "conversation.shareToken", projectId: "conversation.projectId" },
  messages: { id: "message.id", conversationId: "message.conversationId", role: "message.role", createdAt: "message.createdAt" },
  projects: { id: "project.id" },
  missions: { id: "mission.id" },
}));

const conversationsTable = tables.conversations;
const messagesTable = tables.messages;
const projectsTable = tables.projects;

const conversation = {
  id: "conv-1",
  title: "Conversa pública",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:01:00.000Z"),
  projectId: null,
};

const visibleMessages = [
  { id: "msg-1", role: "user", content: "Olá", createdAt: new Date("2026-10-01T00:00:01.000Z") },
  { id: "msg-2", role: "assistant", content: "Resposta ghp_secret_123456789012", createdAt: new Date("2026-10-01T00:00:02.000Z") },
];

let conversationExists = true;

vi.mock("@plutao/db", () => ({
  conversations: tables.conversations,
  messages: tables.messages,
  projects: tables.projects,
  missions: tables.missions,
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === conversationsTable) return conversationExists ? [conversation] : [];
            if (table === projectsTable) return [];
            return [];
          },
          orderBy: async () => (table === messagesTable ? visibleMessages : []),
        }),
      }),
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/share/[token]", () => {
  beforeEach(() => {
    conversationExists = true;
  });

  it("retorna snapshot read-only da conversa e sanitiza conteúdo", async () => {
    const response = await GET(new Request("http://localhost/api/share/conv_token") as never, {
      params: Promise.resolve({ token: "conv_token" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe("conversation");
    expect(body.conversation.title).toBe("Conversa pública");
    expect(body.conversation.messages).toHaveLength(2);
    expect(body.conversation.messages[1].content).toContain("[redacted]");
    expect(body.conversation.messages[1]).not.toHaveProperty("metadata");
    expect(body).not.toHaveProperty("mission");
  });

  it("retorna 404 para conversa desativada ou inexistente", async () => {
    conversationExists = false;
    const response = await GET(new Request("http://localhost/api/share/conv_missing") as never, {
      params: Promise.resolve({ token: "conv_missing" }),
    });

    expect(response.status).toBe(404);
  });
});
