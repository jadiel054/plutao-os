import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de lógica de seq + scrub no caminho de append.
 * DB é mockado: validamos retries de UNIQUE e que scrub roda antes do insert.
 */

const inserts: Array<Record<string, unknown>> = [];
let maxSeq = 0;
let failOnce = false;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => (maxSeq > 0 ? [{ seq: maxSeq }] : []),
          }),
        }),
      }),
    }),
    insert: (table: { name?: string } | unknown) => ({
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => ({
        returning: async () => {
          const row = Array.isArray(vals) ? vals[0] : vals;
          // detect artifact table by charCount field
          if (row && "charCount" in row && !("seq" in row)) {
            return [{ id: "art-1" }];
          }
          if (failOnce) {
            failOnce = false;
            const err = new Error(
              'duplicate key value violates unique constraint "conversation_events_conversation_id_seq_uidx"'
            );
            throw err;
          }
          maxSeq = Number(row.seq);
          inserts.push(row);
          return [
            {
              ...row,
              id: row.id || "ev-1",
              createdAt: new Date("2026-09-28T00:00:00Z"),
            },
          ];
        },
      }),
    }),
  }),
}));

vi.mock("@plutao/db", () => ({
  conversationEvents: { seq: "seq", conversationId: "conversationId" },
  eventArtifacts: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  desc: (x: unknown) => x,
  eq: (...a: unknown[]) => a,
  gt: (...a: unknown[]) => a,
  and: (...a: unknown[]) => a,
  asc: (x: unknown) => x,
}));

import { appendConversationEvent } from "../appendConversationEvent";
import { ARTIFACT_CHAR_THRESHOLD } from "../types";

describe("appendConversationEvent", () => {
  beforeEach(() => {
    inserts.length = 0;
    maxSeq = 0;
    failOnce = false;
  });

  it("assigns monotonic seq starting at 1", async () => {
    const a = await appendConversationEvent({
      conversationId: "c1",
      type: "user_message",
      preview: "oi",
    });
    expect(a?.seq).toBe(1);
    maxSeq = 1;
    const b = await appendConversationEvent({
      conversationId: "c1",
      type: "assistant_message",
      preview: "olá",
    });
    expect(b?.seq).toBe(2);
  });

  it("retries seq on unique violation (concurrent writes)", async () => {
    maxSeq = 3;
    failOnce = true;
    const ev = await appendConversationEvent({
      conversationId: "c1",
      type: "state_update",
      preview: "ok",
    });
    // first attempt seq=4 fails; second reads maxSeq (still 3 until success) → 4 again
    // after failOnce cleared, insert succeeds
    expect(ev).not.toBeNull();
    expect(ev!.seq).toBeGreaterThanOrEqual(4);
    expect(inserts.length).toBeGreaterThanOrEqual(1);
  });

  it("scrubs secrets in preview before insert", async () => {
    await appendConversationEvent({
      conversationId: "c1",
      type: "observation",
      preview: "key sk-test_ABC123XYZ7890123456789 leaked",
    });
    const row = inserts[0];
    expect(String(row.preview)).not.toMatch(/sk-test_ABC123/);
  });

  it("creates artifact when fullText exceeds threshold", async () => {
    const big = "Z".repeat(ARTIFACT_CHAR_THRESHOLD + 50);
    const ev = await appendConversationEvent({
      conversationId: "c1",
      type: "observation",
      fullText: big,
      preview: big.slice(0, 100),
    });
    expect(ev?.artifactId).toBe("art-1");
    expect(String(ev?.preview)).toContain("Full output");
    expect(String(ev?.preview).length).toBeLessThan(big.length);
  });
});
