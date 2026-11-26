import { describe, expect, it } from "vitest";
import {
  isNearBottom,
  shouldShowJumpToLatest,
  saveChatScrollPosition,
  loadChatScrollPosition,
  clearChatScrollPositions,
} from "../chatScroll";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("isNearBottom", () => {
  it("detecta proximidade do fim", () => {
    expect(isNearBottom(1000, 1100, 200)).toBe(true); // faltam ~100-... = exatamente fim
    expect(isNearBottom(830, 1100, 200)).toBe(true);  // faltam 70px < 72
    expect(isNearBottom(500, 1100, 200)).toBe(false); // longe do fim
  });

  it("trata dimensoes invalidas como fim (conteudo nao rolavel)", () => {
    expect(isNearBottom(0, 0, 0)).toBe(true);
  });
});

describe("shouldShowJumpToLatest", () => {
  it("mostra apenas quando longe do fim e rolavel", () => {
    expect(shouldShowJumpToLatest(false, 2000, 400)).toBe(true);
    expect(shouldShowJumpToLatest(true, 2000, 400)).toBe(false);
    expect(shouldShowJumpToLatest(false, 300, 400)).toBe(false);
  });
});

describe("scroll position store", () => {
  it("salva e restaura por conversa", () => {
    const storage = fakeStorage();
    saveChatScrollPosition("c1", 1234.7, storage);
    expect(loadChatScrollPosition("c1", storage)).toBe(1235);
    expect(loadChatScrollPosition("c2", storage)).toBeNull();
  });

  it("ignora entradas invalidas", () => {
    const storage = fakeStorage();
    saveChatScrollPosition("", 100, storage);
    saveChatScrollPosition("c1", Number.NaN, storage);
    expect(loadChatScrollPosition("c1", storage)).toBeNull();
  });

  it("limpa posicoes", () => {
    const storage = fakeStorage();
    saveChatScrollPosition("c1", 10, storage);
    clearChatScrollPositions(["c1"], storage);
    expect(loadChatScrollPosition("c1", storage)).toBeNull();
  });
});
