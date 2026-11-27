import { describe, expect, it } from "vitest";
import { MAX_HISTORY, mergeEvents, nextBackoffMs, type PanelEvent } from "./eventsPanelLogic";

function ev(seq: number, id = "e" + seq): PanelEvent {
  return { id, seq, type: "action", source: "tool_dispatcher", preview: "p", artifactId: null, createdAt: new Date().toISOString() };
}

describe("mergeEvents", () => {
  it("adiciona eventos novos em ordem de seq", () => {
    let list: PanelEvent[] = [];
    list = mergeEvents(list, ev(2));
    list = mergeEvents(list, ev(1));
    expect(list.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("descarta duplicado por id (reconexão/replay)", () => {
    let list = mergeEvents([], ev(1, "x"));
    list = mergeEvents(list, ev(1, "x"));
    expect(list).toHaveLength(1);
  });

  it("descarta duplicado por seq mesmo com id diferente", () => {
    let list = mergeEvents([], ev(1, "a"));
    list = mergeEvents(list, ev(1, "b"));
    expect(list).toHaveLength(1);
  });

  it("respeita o teto de histórico", () => {
    let list: PanelEvent[] = [];
    for (let i = 1; i <= MAX_HISTORY + 50; i++) list = mergeEvents(list, ev(i));
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0]!.seq).toBe(51);
    expect(list[list.length - 1]!.seq).toBe(MAX_HISTORY + 50);
  });
});

describe("nextBackoffMs", () => {
  it("cresce exponencialmente até o teto de 15s", () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(4)).toBe(15000);
    expect(nextBackoffMs(9)).toBe(15000);
  });

  it("aceita tentativa negativa sem quebrar", () => {
    expect(nextBackoffMs(-3)).toBe(1000);
  });
});

describe("backoff do painel — falhas repetidas após conexão estabelecida", () => {
  it("sem reset em ready: atrasos crescem 2s, 4s, 8s, 15s, 15s... até o teto", () => {
    // Simula o ciclo do painel: cada "error" incrementa attempt e o "ready"
    // NÃO zera o contador. Reconexões 1 a 6 consecutivas:
    let attempt = 0;
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      attempt += 1; // erro
      delays.push(nextBackoffMs(attempt));
      // "ready" chega aqui e NÃO altera attempt
    }
    expect(delays).toEqual([2000, 4000, 8000, 15000, 15000, 15000]);
  });
});
