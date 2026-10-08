"use client";

import { extractAnswerSections } from "@/lib/chat/answerFormatting";
import { ReasoningBlock, type ReasoningStepItem } from "./ReasoningBlock";
import { ActionCards, type ToolCallItem } from "./ActionCards";
import { CodeBlock } from "./CodeBlock";
import { AnswerResultCard } from "./AnswerResultCard";
import { MarkdownRenderer } from "./MarkdownRenderer";

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
  isEdited?: boolean;
};

/** Parses text content to extract ```lang ... ``` code blocks. */
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

function renderMarkdownParts(content: string) {
  const parts = parseContentParts(content);
  return parts.map((part, index) => {
    if (part.type === "code") {
      return <CodeBlock key={index} code={part.text} language={part.language} />;
    }
    if (!part.text.trim()) return null;
    return <MarkdownRenderer key={index} text={part.text} />;
  });
}

export function StructuredMessage({
  role,
  content,
  steps,
  trace,
  isStreaming = false,
  isEdited = false,
}: StructuredMessageProps) {
  if (role === "user") {
    return (
      <div className="whitespace-pre-wrap [overflow-wrap:anywhere] break-words">
        {content}
        {isEdited && (
          <span className="ml-1.5 text-[10px] opacity-70 font-normal italic">
            (editada)
          </span>
        )}
      </div>
    );
  }

  const reasoningSteps: ReasoningStepItem[] =
    steps
      ?.filter((step): step is { type: "reasoning"; reasoning: ReasoningStepItem } => step.type === "reasoning")
      .map((step) => step.reasoning) ?? [];

  const toolCallSteps: ToolCallItem[] =
    steps
      ?.filter((step): step is { type: "tool_call"; toolCall: ToolCallItem } => step.type === "tool_call")
      .map((step) => step.toolCall) ??
    trace?.toolCalls ?? [];

  const { result, body } = extractAnswerSections(content);
  const isReasoningStreaming = isStreaming && toolCallSteps.length === 0 && !content;

  return (
    <div className="min-w-0 space-y-4 [overflow-wrap:anywhere] break-words">
      {result ? <AnswerResultCard content={result.content} /> : null}

      {reasoningSteps.length > 0 && (
        <ReasoningBlock steps={reasoningSteps} isStreaming={isReasoningStreaming} />
      )}

      {body.trim() ? <div className="space-y-3">{renderMarkdownParts(body)}</div> : null}

      {toolCallSteps.length > 0 ? <ActionCards toolCalls={toolCallSteps} /> : null}

      {toolCallSteps.length > 0 ? (
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--text-muted)]">
          <span className="opacity-60">Fontes de ferramenta</span>
          <span className="opacity-40">·</span>
          <span className="font-medium text-[var(--selo)]">
            {toolCallSteps[0]?.provider ?? "conector"} ({toolCallSteps.length} {toolCallSteps.length === 1 ? "chamada" : "chamadas"})
          </span>
        </div>
      ) : null}
    </div>
  );
}
