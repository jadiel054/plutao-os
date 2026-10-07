/**
 * Runner Telegram — detecta intenção no chat e chama as ferramentas do Telegram.
 */

import { runTelegram } from "@/lib/runtime/tools/telegram";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { sanitizeText } from "@/lib/security/sanitize";

export type TelegramToolCallTrace = {
  id: string;
  provider: "telegram";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type TelegramToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  capability?: string;
  trace?: TelegramToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
  output?: string;
  error?: string;
};

function extractMessageTextCandidate(text: string): string | undefined {
  const patterns = [
    /(?:enviar|mandar|notificar|mande|envie)\s+(?:a\s+)?mensagem\s+["']([^"']+)["']/i,
    /(?:enviar|mandar|notificar|mande|envie)\s+["']([^"']+)["']\s+(?:no|para|pro)\s+telegram/i,
    /(?:no|para|pro)\s+telegram\s+["']([^"']+)["']/i,
    /(?:enviar|mandar|notificar|mande|envie)\s+(?:a\s+)?mensagem\s+:\s*(.+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] && m[1].trim()) {
      return m[1].trim();
    }
  }

  // Fallback if text contains "telegram" and explicit instruction like "envie no telegram dizendo X"
  const flexMatch = text.match(/(?:dizendo|com o texto|mensagem)\s+(.+)/i);
  if (flexMatch?.[1] && text.toLowerCase().includes("telegram")) {
    return flexMatch[1].trim();
  }

  return undefined;
}

function wantsSendMessage(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("telegram")) return false;
  return (
    t.includes("enviar") ||
    t.includes("mandar") ||
    t.includes("notificar") ||
    t.includes("mande") ||
    t.includes("envie") ||
    t.includes("mensagem") ||
    t.includes("send")
  );
}

function wantsGetUpdates(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("telegram")) return false;
  return (
    t.includes("ler") ||
    t.includes("ouvir") ||
    t.includes("checar") ||
    t.includes("ver") ||
    t.includes("updates") ||
    t.includes("mensagens") ||
    t.includes("recebidas") ||
    t.includes("novas")
  );
}

function wantsGetMe(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("telegram")) return false;
  return (
    t.includes("bot info") ||
    t.includes("status") ||
    t.includes("validar") ||
    t.includes("info do bot") ||
    t.includes("meu bot")
  );
}

export async function detectAndExecuteTelegramTool(opts: {
  text?: string;
  userText?: string;
  userId: string;
  missionId?: string | null;
}): Promise<TelegramToolExecutionResult> {
  const userText = opts.text ?? opts.userText ?? "";
  const userId = opts.userId;
  const timestamp = new Date().toISOString();

  if (wantsSendMessage(userText)) {
    const messageText = extractMessageTextCandidate(userText);
    if (!messageText) {
      return {
        executed: false,
        missingArgs: true,
        capability: "send_message",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - TELEGRAM]\nO usuário deseja enviar uma mensagem pelo Telegram, mas não informou o conteúdo da mensagem.\nPeça para o usuário fornecer o texto da mensagem a ser enviada.`,
      };
    }

    const payload = { action: "send_message", text: messageText };
    const res = await runTelegram(JSON.stringify(payload), userId);

    const trace: TelegramToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "telegram",
      capability: "send_message",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR TELEGRAM]\nCapability: send_message\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR TELEGRAM]\nCapability: send_message\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "send_message", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsGetUpdates(userText)) {
    const payload = { action: "get_updates" };
    const res = await runTelegram(JSON.stringify(payload), userId);

    const trace: TelegramToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "telegram",
      capability: "get_updates",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR TELEGRAM]\nCapability: get_updates\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR TELEGRAM]\nCapability: get_updates\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "get_updates", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsGetMe(userText)) {
    const payload = { action: "get_me" };
    const res = await runTelegram(JSON.stringify(payload), userId);

    const trace: TelegramToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "telegram",
      capability: "get_me",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR TELEGRAM]\nCapability: get_me\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR TELEGRAM]\nCapability: get_me\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "get_me", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  return { executed: false };
}

async function maybeAppendMissionEvidence(
  missionId: string | null | undefined,
  userId: string,
  trace: TelegramToolCallTrace,
  ok: boolean
) {
  if (!missionId) return;
  try {
    const db = getDb();
    const rows = await db
      .select({ evidence: missions.evidence })
      .from(missions)
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
      .limit(1);
    if (!rows[0]) return;
    const prevEv = parseEvidence(rows[0].evidence);
    const evidenceItem: EvidenceItem = {
      id: trace.id,
      type: ok ? "tool_result" : "tool_error",
      content: sanitizeText(`tool:telegram capability:${trace.capability} → ${trace.output}`),
      source: "tool_dispatcher",
      taskId: null,
      missionId,
      createdAt: trace.timestamp,
    };
    await db
      .update(missions)
      .set({ evidence: [...prevEv, evidenceItem], updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));
  } catch {
    /* ignore */
  }
}
