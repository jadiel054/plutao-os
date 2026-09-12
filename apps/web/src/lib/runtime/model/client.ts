import type { ModelConfig, ModelMessage, ModelStepResult, ModelToolProposal } from "./types";

/**
 * OpenAI-compatible chat completions (works for OpenAI and xAI).
 */
export async function chatCompletion(
  config: ModelConfig,
  messages: ModelMessage[]
): Promise<ModelStepResult> {
  const start = Date.now();
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  const latencyMs = Date.now() - start;
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (!res.ok) {
    const msg = body.error?.message || `provider HTTP ${res.status}`;
    throw new Error(msg);
  }

  const content = body.choices?.[0]?.message?.content?.trim() || "";
  return {
    provider: config.provider,
    model: config.model,
    content,
    toolProposal: parseToolProposal(content),
    usage: {
      promptTokens: body.usage?.prompt_tokens,
      completionTokens: body.usage?.completion_tokens,
    },
    latencyMs,
  };
}

/**
 * Accepts either pure JSON or a fenced block:
 * {"tool":"note","input":"..."}
 */
export function parseToolProposal(content: string): ModelToolProposal | null {
  const trimmed = content.trim();
  const candidates: string[] = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());

  const inline = trimmed.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (inline) candidates.unshift(inline[0]);

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c) as { tool?: unknown; name?: unknown; input?: unknown };
      const name = String(obj.tool ?? obj.name ?? "").trim();
      const input = obj.input != null ? String(obj.input) : "";
      if (name) return { name, input };
    } catch {
      /* try next */
    }
  }
  return null;
}
