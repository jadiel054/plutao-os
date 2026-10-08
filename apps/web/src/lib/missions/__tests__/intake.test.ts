import { describe, expect, it } from "vitest";
import { matchesMissionIntake, parseMissionIntake } from "../intake";

const conversationId = "32b3f52f-3a82-4d32-97ea-ea95bd157420";

describe("parseMissionIntake", () => {
  it("normalizes a Cockpit request and accepts an idempotency key from the header", () => {
    expect(
      parseMissionIntake(
        {
          objective: "  Organizar a implantação  ",
          context: "  contexto  ",
          source: "cockpit",
        },
        " cockpit-attempt-1 "
      )
    ).toEqual({
      ok: true,
      input: {
        objective: "Organizar a implantação",
        context: "contexto",
        constraints: null,
        definitionOfDone: null,
        creationSource: "cockpit",
        conversationId: null,
        idempotencyKey: "cockpit-attempt-1",
      },
    });
  });

  it("accepts a chat request with an optional conversation link", () => {
    const parsed = parseMissionIntake(
      {
        objective: "Preparar a análise",
        source: "chat",
        conversationId,
        idempotencyKey: "chat-attempt-1",
      },
      "chat-attempt-1"
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.creationSource).toBe("chat");
      expect(parsed.input.conversationId).toBe(conversationId);
    }
  });

  it("rejects malformed UUIDs, unsupported origins, and conflicting idempotency keys", () => {
    expect(
      parseMissionIntake({ objective: "Uma missão válida", conversationId: "not-a-uuid" }, null)
    ).toMatchObject({ ok: false, error: "Identificador da conversa inválido." });
    expect(
      parseMissionIntake({ objective: "Uma missão válida", source: "unknown" }, null)
    ).toMatchObject({ ok: false, error: "Origem da missão inválida." });
    expect(
      parseMissionIntake(
        { objective: "Uma missão válida", idempotencyKey: "body-key" },
        "header-key"
      )
    ).toMatchObject({ ok: false });
  });

  it("keeps authentication and content checks explicit at the intake boundary", () => {
    expect(parseMissionIntake({ objective: "ab" }, null)).toMatchObject({ ok: false });
    expect(parseMissionIntake({ objective: "Valid objective", context: { unsafe: true } }, null)).toMatchObject({ ok: false });
  });
});

describe("matchesMissionIntake", () => {
  const input = parseMissionIntake(
    {
      objective: "Gerar o relatório",
      source: "chat",
      conversationId,
      context: "pedido original",
    },
    "request-1"
  );

  it("recognizes a replay of the exact same request", () => {
    if (!input.ok) throw new Error("fixture inválida");
    expect(matchesMissionIntake(input.input, input.input)).toBe(true);
  });

  it("rejects a reused key when objective or conversation differs", () => {
    if (!input.ok) throw new Error("fixture inválida");
    expect(
      matchesMissionIntake(input.input, { ...input.input, objective: "Outro objetivo" })
    ).toBe(false);
    expect(
      matchesMissionIntake(input.input, { ...input.input, conversationId: null })
    ).toBe(false);
  });
});
