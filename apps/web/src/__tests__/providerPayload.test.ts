import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion, streamChatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage } from "@/lib/runtime/model/types";

describe("Provider Payload Sanitization (Regression Test)", () => {
  const mockConfig: ModelConfig = {
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sanitizes messages in chatCompletion body by discarding non-standard properties like source", async () => {
    let capturedRequestBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.body) {
        capturedRequestBody = JSON.parse(init.body as string);
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Hello!" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      } as Response;
    });

    // Message with internal 'source' property (from toolResultToMessage in agent-loop.ts)
    const messagesWithSource = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "User prompt" },
      { role: "user", content: "Tool result content", source: "tool_result" },
    ] as unknown as ModelMessage[];

    await chatCompletion(mockConfig, messagesWithSource);

    expect(capturedRequestBody).not.toBeNull();
    const sentMessages = capturedRequestBody!.messages as Array<Record<string, unknown>>;
    expect(sentMessages).toHaveLength(3);

    // Verify 'source' is stripped from every message in payload
    for (const msg of sentMessages) {
      expect(msg).not.toHaveProperty("source");
    }

    // Verify role and content are preserved
    expect(sentMessages[2]).toEqual({
      role: "user",
      content: "Tool result content",
    });
  });

  it("sanitizes messages in streamChatCompletion body by discarding non-standard properties like source", async () => {
    let capturedRequestBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.body) {
        capturedRequestBody = JSON.parse(init.body as string);
      }
      // Return dummy SSE stream
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n'));
          controller.close();
        },
      });
      return {
        ok: true,
        body: stream,
      } as Response;
    });

    const messagesWithSource = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Tool result content", source: "tool_result" },
    ] as unknown as ModelMessage[];

    const gen = streamChatCompletion(mockConfig, messagesWithSource);
    for await (const _chunk of gen) {
      /* consume generator */
    }

    expect(capturedRequestBody).not.toBeNull();
    const sentMessages = capturedRequestBody!.messages as Array<Record<string, unknown>>;
    expect(sentMessages).toHaveLength(2);

    for (const msg of sentMessages) {
      expect(msg).not.toHaveProperty("source");
    }

    expect(sentMessages[1]).toEqual({
      role: "user",
      content: "Tool result content",
    });
  });
});
