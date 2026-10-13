import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  isNativeLocalSupported,
  getSelectedLocalModel,
  setSelectedLocalModel,
  listInstalledModels,
  importModelFile,
  deleteModel,
  runLocalChatCompletion,
} from "../localModelManager";

describe("LocalModelManager", () => {
  beforeAll(() => {
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    };
    if (typeof globalThis.window === "undefined") {
      // @ts-expect-error mocking window in node
      globalThis.window = {};
    }
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("checks native local support", () => {
    // In node/vitest, Capacitor is not native by default
    expect(isNativeLocalSupported()).toBe(false);
  });

  it("gets and sets selected local model preference", () => {
    expect(getSelectedLocalModel()).toBeNull();
    setSelectedLocalModel("Qwen2.5-1.5B-Instruct-q4_k_m");
    expect(getSelectedLocalModel()).toBe("Qwen2.5-1.5B-Instruct-q4_k_m");
    setSelectedLocalModel(null);
    expect(getSelectedLocalModel()).toBeNull();
  });

  it("imports and lists local GGUF models in fallback mode", async () => {
    const initialList = await listInstalledModels();
    expect(initialList).toEqual([]);

    const dummyFile = {
      name: "qwen2.5-1.5b.gguf",
      size: 1100000000,
    } as File;

    const imported = await importModelFile(dummyFile, "Qwen2.5 1.5B Custom");
    expect(imported.id).toBe("qwen2.5-1.5b");
    expect(imported.name).toBe("Qwen2.5 1.5B Custom");

    const updatedList = await listInstalledModels();
    expect(updatedList.length).toBe(1);
    expect(updatedList[0].id).toBe("qwen2.5-1.5b");
  });

  it("deletes installed local model and clears selected preference if matched", async () => {
    const dummyFile = { name: "qwen2.5-3b.gguf", size: 2300000000 } as File;
    await importModelFile(dummyFile);

    setSelectedLocalModel("qwen2.5-3b");
    expect(getSelectedLocalModel()).toBe("qwen2.5-3b");

    const deleted = await deleteModel("qwen2.5-3b");
    expect(deleted).toBe(true);

    const listAfterDelete = await listInstalledModels();
    expect(listAfterDelete.find((m) => m.id === "qwen2.5-3b")).toBeUndefined();
    expect(getSelectedLocalModel()).toBeNull();
  });

  it("runs local chat completion and streams tokens to callback", async () => {
    const tokensReceived: string[] = [];
    let finalText = "";

    const response = await runLocalChatCompletion(
      {
        messages: [{ role: "user", content: "Qual o sentido da vida?" }],
        modelId: "qwen2.5-1.5b",
      },
      (token, fullText) => {
        tokensReceived.push(token);
        finalText = fullText;
      }
    );

    expect(tokensReceived.length).toBeGreaterThan(0);
    expect(finalText).toContain("qwen2.5-1.5b");
    expect(response).toBe(finalText);
  });
});
