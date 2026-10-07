import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/missions/ownership", () => ({ getOwnedConversation: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getSessionUser } from "@/lib/auth/session";
import { getOwnedConversation } from "@/lib/missions/ownership";
import { getDb } from "@/lib/db";
import { POST } from "../route";

const user = { id: "17e157d7-e9e1-4d48-a02f-2e9fdc5cd1d3" };
const conversationId = "32b3f52f-3a82-4d32-97ea-ea95bd157420";

function makeRequest(body: unknown, idempotencyKey = "attempt-1") {
  return new NextRequest("http://localhost/api/missions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function insertOnlyDb(insertedMission: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([insertedMission]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { db: { insert }, values, returning };
}

function duplicateDb(existingMission: Record<string, unknown>) {
  const returning = vi.fn().mockRejectedValue({ code: "23505" });
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const selection = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([existingMission]),
  };
  const select = vi.fn().mockReturnValue(selection);
  return { db: { insert, select }, values, selection };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(user as never);
  vi.mocked(getOwnedConversation).mockResolvedValue({ id: conversationId } as never);
});

describe("POST /api/missions unified intake", () => {
  it("requires a signed-in session before touching persistence", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const response = await POST(makeRequest({ objective: "Uma missão" }));

    expect(response.status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects a conversation that is not owned by the authenticated user", async () => {
    vi.mocked(getOwnedConversation).mockResolvedValue(null as never);

    const response = await POST(
      makeRequest({ objective: "Preparar entrega", source: "chat", conversationId })
    );

    expect(response.status).toBe(404);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("persists the validated origin, conversation link and idempotency key", async () => {
    const insertedMission = {
      id: "mission-1",
      objective: "Preparar entrega",
      status: "CREATED",
      currentState: "CREATED",
      definitionOfDone: null,
      creationSource: "chat",
      conversationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mock = insertOnlyDb(insertedMission);
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await POST(
      makeRequest(
        { objective: " Preparar entrega ", source: "chat", conversationId },
        "chat-attempt-1"
      )
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.mission.id).toBe("mission-1");
    expect(mock.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        objective: "Preparar entrega",
        creationSource: "chat",
        conversationId,
        idempotencyKey: "chat-attempt-1",
      })
    );
  });

  it("returns the same mission for an exact idempotent replay", async () => {
    const existingMission = {
      id: "mission-existing",
      objective: "Preparar entrega",
      context: null,
      constraints: null,
      definitionOfDone: null,
      creationSource: "chat",
      conversationId,
      status: "CREATED",
      currentState: "CREATED",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mock = duplicateDb(existingMission);
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await POST(
      makeRequest(
        { objective: "Preparar entrega", source: "chat", conversationId },
        "chat-attempt-1"
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deduplicated).toBe(true);
    expect(data.mission.id).toBe("mission-existing");
  });

  it("rejects reuse of a key for a different mission", async () => {
    const existingMission = {
      id: "mission-existing",
      objective: "Outro objetivo",
      context: null,
      constraints: null,
      definitionOfDone: null,
      creationSource: "chat",
      conversationId,
      status: "CREATED",
      currentState: "CREATED",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mock = duplicateDb(existingMission);
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await POST(
      makeRequest(
        { objective: "Preparar entrega", source: "chat", conversationId },
        "chat-attempt-1"
      )
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});
