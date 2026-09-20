"use client";

import { ReasoningBlock, type ReasoningStepItem } from "./ReasoningBlock";
import { ActionCards, type ToolCallItem } from "./ActionCards";
import { CodeBlock } from "./CodeBlock";

export type StructuredStep =
  | { type: "reasoning"; reasoning: ReasoningStepItem }
  | { type: "tool_call"; toolCall: ToolCallItem }
  | { type: "artifact"; artifact: { id: string; name: string; type: string } };

type StructuredMessageProps = {
  role: "user" | "assistant";
  content: string;
  steps?: StructuredStep[];
  trace?: { toolCalls?: ToolCallItem[] };
  isStreaming?: boolean;
};

/** Parses text content to extract ```lang ... ``` code blocks */
function parseContentParts(content: string) {
  const parts: Array<{ type: "text" | "code"; text: string; language?: string }> = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      language: match[1] || "code",
      text: match[2],
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }

  return parts;
}

export function StructuredMessage({
  role,
  content,
  steps,
  trace,
  isStreaming = false,
}: StructuredMessageProps) {
  if (role === "user") {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  const reasoningSteps: ReasoningStepItem[] =
    steps
      ?.filter((s): s is { type: "reasoning"; reasoning: ReasoningStepItem } => s.type === "reasoning")
      .map((s) => s.reasoning) ?? [];

  const toolCallSteps: ToolCallItem[] =
    steps
      ?.filter((s): s is { type: "tool_call"; toolCall: ToolCallItem } => s.type === "tool_call")
      .map((s) => s.toolCall) ??
    trace?.toolCalls ?? [];

  const parts = parseContentParts(content);

  // Reasoning is still streaming only while no tools and no content yet
  const isReasoningStreaming = isStreaming && toolCallSteps.length === 0 && !content;

  return (
    <div className="space-y-4">
      {/* FASE 1 — Raciocínio */}
      {reasoningSteps.length > 0 && (
        <ReasoningBlock steps={reasoningSteps} isStreaming={isReasoningStreaming} />
      )}

      {/* FASE 2 — Ações / Tools */}
      {toolCallSteps.length > 0 && <ActionCards toolCalls={toolCallSteps} />}

      {/* FASE 3 — Resposta final + CodeBlocks */}
      {(parts.length > 0 && (parts.length > 1 || parts[0]?.text?.trim())) && (
        <div className="space-y-3">
          {parts.map((p, idx) => {
            if (p.type === "code") {
              return <CodeBlock key={idx} code={p.text} language={p.language} />;
            }
            if (!p.text.trim()) return null;
            return (
              <div key={idx} className="whitespace-pre-wrap leading-relaxed text-[14.5px]">
                {p.text}
              </div>
            );
          })}
        </div>
      )}

      {/* Rodapé de fontes */}
      {toolCallSteps.length > 0 && (
        <div className="pt-1 text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
          <span className="opacity-60">fontes</span>
          <span className="opacity-40">·</span>
          <span className="text-[var(--selo)] font-medium">
            {toolCallSteps[0]?.provider ?? "GitHub"}{" "}
            ({toolCallSteps.length} {toolCallSteps.length === 1 ? "chamada" : "chamadas"})
          </span>
        </div>
      )}
    </div>
  );
}
