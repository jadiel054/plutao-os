"use client";

import { extractAnswerSections } from "@/lib/chat/answerFormatting";
import { deriveAgentActivity } from "@/lib/chat/activityState";
import { groupConsecutiveByProvider } from "@/lib/chat/toolGroups";
import { providerDisplayName } from "@/lib/chat/toolLogos";
import { ReasoningBlock, type ReasoningStepItem } from "./ReasoningBlock";
import { ActionCards, type ToolCallItem } from "./ActionCards";
import { ToolLogo } from "./ToolLogos";
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

  // Estado de atividade do agente, derivado SOMENTE de eventos reais
  // (streaming ativo e status das tool calls). Falhas permanecem visiveis
  // apos o fim do streaming; estados transititorios so durante a execucao.
  const hasFailure = toolCallSteps.some(
    (tc) => tc.status === "error" || tc.status === "failed",
  );
  const activity =
    isStreaming || hasFailure
      ? deriveAgentActivity(toolCallSteps, isStreaming, content.length > 0)
      : null;

  // Agrupamento consecutivo por provedor (mesma regra dos blocos visuais),
  // usado no resumo de fontes para nao misturar provedores distintos.
  const toolGroups = groupConsecutiveByProvider(toolCallSteps);

  return (
    <div className="min-w-0 space-y-4 [overflow-wrap:anywhere] break-words">
      {activity ? (
        <div
          className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"
          role="status"
          aria-live="polite"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${activity.tone}`} aria-hidden />
          <span className="font-medium text-[var(--text-secondary)]">{activity.label}</span>
          {activity.detail ? (
            <span className="opacity-60">· {providerDisplayName(activity.detail)}</span>
          ) : null}
        </div>
      ) : null}

      {result ? <AnswerResultCard content={result.content} /> : null}

      {reasoningSteps.length > 0 && (
        <ReasoningBlock steps={reasoningSteps} isStreaming={isReasoningStreaming} />
      )}

      {toolCallSteps.length > 0 ? <ActionCards toolCalls={toolCallSteps} /> : null}

      {body.trim() ? <div className="space-y-3">{renderMarkdownParts(body)}</div> : null}

      {toolGroups.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px] text-[var(--text-muted)]">
          <span className="opacity-60">Fontes de ferramenta</span>
          {toolGroups.map((group, gi) => (
            <span
              key={`src-${group.provider}-${gi}-${group.calls[0]?.id ?? ""}`}
              className="inline-flex items-center gap-1"
            >
              {gi > 0 ? <span className="opacity-40" aria-hidden>·</span> : null}
              <ToolLogo provider={group.provider} size={12} />
              <span className="font-medium text-[var(--selo)]">
                {providerDisplayName(group.provider)}
              </span>
              <span className="opacity-60">
                ({group.calls.length} {group.calls.length === 1 ? "operação" : "operações"})
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
