import { emitAction, emitObservation } from "@/lib/events/appendConversationEvent";
import { sanitizeText } from "@/lib/security/sanitize";

/** G2: action + observation no event stream quando tools de conector rodam no chat. */
export async function emitConnectorToolEvents(
  conversationId: string | null,
  toolRunRes: {
    github?: {
      executed?: boolean;
      trace?: {
        capability?: string;
        input?: unknown;
        output?: string;
        status?: string;
      };
    };
    vercel?: {
      executed?: boolean;
      trace?: {
        capability?: string;
        input?: unknown;
        output?: string;
        status?: string;
      };
    };
    generic?: {
      executed?: boolean;
      trace?: {
        tool?: string;
        capability?: string;
        input?: unknown;
        output?: string;
        status?: string;
      };
    };
  }
) {
  if (!conversationId) return;
  const jobs: Array<Promise<unknown>> = [];
  const push = (
    tool: string,
    inputSummary: string,
    output: string,
    ok: boolean
  ) => {
    jobs.push(
      emitAction({
        conversationId,
        tool,
        inputSummary,
        source: "chat_tools",
      }).then(() =>
        emitObservation({
          conversationId,
          tool,
          ok,
          outputOrError: output || "(vazio)",
          source: "chat_tools",
        })
      )
    );
  };
  if (toolRunRes.github?.executed && toolRunRes.github.trace) {
    const t = toolRunRes.github.trace;
    const input =
      typeof t.input === "string" ? t.input : JSON.stringify(t.input ?? {});
    push(
      "github",
      `${t.capability ?? "github"} · ${sanitizeText(input).slice(0, 200)}`,
      sanitizeText(t.output ?? ""),
      t.status !== "error"
    );
  }
  if (toolRunRes.vercel?.executed && toolRunRes.vercel.trace) {
    const t = toolRunRes.vercel.trace;
    const input =
      typeof t.input === "string" ? t.input : JSON.stringify(t.input ?? {});
    push(
      "vercel",
      `${t.capability ?? "vercel"} · ${sanitizeText(input).slice(0, 200)}`,
      sanitizeText(t.output ?? ""),
      t.status !== "error"
    );
  }
  if (toolRunRes.generic?.executed && toolRunRes.generic.trace) {
    const t = toolRunRes.generic.trace;
    const tool = t.tool || t.capability || "tool";
    const input =
      typeof t.input === "string" ? t.input : JSON.stringify(t.input ?? {});
    push(
      String(tool),
      sanitizeText(input).slice(0, 200),
      sanitizeText(t.output ?? ""),
      t.status !== "error"
    );
  }
  await Promise.allSettled(jobs);
}
