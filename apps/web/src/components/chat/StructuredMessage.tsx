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

export function StructuredMessage({ role, content, steps, trace }: StructuredMessageProps) {
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

  return (
    <div className="space-y-3">
      {/* 1. Reasoning Block */}
      {reasoningSteps.length > 0 && <ReasoningBlock steps={reasoningSteps} />}

      {/* 2. Action Cards */}
      {toolCallSteps.length > 0 && <ActionCards toolCalls={toolCallSteps} />}

      {/* 3. Text & Code Blocks */}
      <div className="space-y-2">
        {parts.map((p, idx) => {
          if (p.type === "code") {
            return <CodeBlock key={idx} code={p.text} language={p.language} />;
          }
          return (
            <div key={idx} className="whitespace-pre-wrap leading-relaxed">
              {p.text}
            </div>
          );
        })}
      </div>

      {/* 4. Sources citation footer if connector actions were performed */}
      {toolCallSteps.length > 0 && (
        <div className="pt-2 border-t border-[var(--border)]/40 text-[10px] text-[var(--text-muted)] font-mono flex items-center gap-1.5">
          <span>fontes:</span>
          <span className="text-[var(--selo)] font-semibold">
            conector {toolCallSteps[0]?.provider ?? "GitHub"} ({toolCallSteps.length}{" "}
            {toolCallSteps.length === 1 ? "chamada" : "chamadas"})
          </span>
        </div>
      )}
    </div>
  );
}
