import { getConnectorRow, getAccessToken } from "@/lib/connectors/service";
import { decryptToken } from "@/lib/connectors/crypto";
import { guardWrite, type GateFinalize } from "@/lib/connectors/writeGateGuard";
import { capabilityBlockReason } from "@/lib/capabilities/registry";
import type { ToolResult } from "./types";

export type TelegramCredentials = {
  botToken: string;
  chatId: string | null;
};

export async function getTelegramCredentials(
  userId: string
): Promise<TelegramCredentials | null> {
  const row = await getConnectorRow(userId, "telegram");
  if (!row || row.status !== "connected") return null;

  const botToken = await getAccessToken(userId, "telegram");
  if (!botToken) return null;

  let chatId: string | null = null;
  if (row.refreshTokenEnc) {
    try {
      const jsonStr = decryptToken(row.refreshTokenEnc);
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (typeof parsed.chatId === "string" && parsed.chatId.trim()) {
        chatId = parsed.chatId.trim();
      } else if (typeof parsed.chatId === "number") {
        chatId = String(parsed.chatId);
      }
    } catch {
      /* ignore invalid refresh token */
    }
  }

  return { botToken, chatId };
}

/** Mask bot token in logs, tool outputs, and error messages */
export function maskToken(text: string, token?: string): string {
  if (!text) return "";
  let sanitized = text;

  if (token && token.length > 6) {
    const masked = `${token.slice(0, 6)}...***`;
    sanitized = sanitized.replaceAll(token, masked);
  }

  // General regex pattern for Telegram bot tokens (e.g. 123456789:ABCdef...)
  sanitized = sanitized.replace(
    /bot\d{6,14}:[A-Za-z0-9_-]{30,50}/g,
    "bot<TOKEN_MASKED>"
  );
  sanitized = sanitized.replace(
    /\b\d{6,14}:[A-Za-z0-9_-]{30,50}\b/g,
    "<TOKEN_MASKED>"
  );

  return sanitized;
}

/** 10s Timeout wrapper for Telegram fetch calls */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tempo limite atingido para requisição ao Telegram (10s).");
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/** telegram.send_message API call */
export async function telegramSendMessage(
  creds: TelegramCredentials,
  opts: { text: string; chatId?: string }
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const { botToken, chatId: configuredChatId } = creds;

  // Determine target chatId
  let targetChatId = opts.chatId?.trim() || configuredChatId;

  // Security enforcement: If a chatId is configured, sending is restricted strictly to that chatId
  if (configuredChatId && opts.chatId && opts.chatId.trim() !== configuredChatId) {
    targetChatId = configuredChatId;
  }

  if (!targetChatId) {
    return {
      ok: false,
      error: "chat_id do Telegram não configurado e não fornecido na chamada.",
    };
  }

  if (!opts.text || !opts.text.trim()) {
    return {
      ok: false,
      error: "O texto da mensagem é obrigatório.",
    };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: opts.text,
      }),
    });

    const textRes = await res.text();
    let data: unknown = textRes;
    try {
      data = JSON.parse(textRes);
    } catch {
      /* fallback */
    }

    if (!res.ok || (typeof data === "object" && data && (data as Record<string, unknown>).ok === false)) {
      const desc = typeof data === "object" && data && "description" in data ? String((data as Record<string, unknown>).description) : textRes;
      return {
        ok: false,
        error: maskToken(`Falha ao enviar mensagem no Telegram: ${desc}`, botToken),
      };
    }

    const obj = data as Record<string, unknown>;
    const result = (obj.result ?? {}) as Record<string, unknown>;
    const msgId = result.message_id ? String(result.message_id) : "?";

    const output = `Mensagem enviada com sucesso no Telegram (chat_id: \`${targetChatId}\`, id: \`${msgId}\`).`;
    return {
      ok: true,
      output: maskToken(output, botToken),
      rawData: data,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Erro ao enviar mensagem no Telegram.";
    return {
      ok: false,
      error: maskToken(errMsg, botToken),
    };
  }
}

/** Extract chat ID from Telegram update item */
function getUpdateChatId(up: Record<string, unknown>): string | null {
  const cb = up.callback_query as Record<string, unknown> | undefined;
  const msg = (up.message || up.edited_message || up.channel_post || cb?.message) as Record<string, unknown> | undefined;
  if (!msg) return null;
  const chat = msg.chat as Record<string, unknown> | undefined;
  if (!chat || chat.id === undefined) return null;
  return String(chat.id);
}

/** telegram.get_updates API call */
export async function telegramGetUpdates(
  creds: TelegramCredentials,
  opts: { offset?: number; limit?: number } = {}
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const { botToken, chatId: configuredChatId } = creds;
  const limit = typeof opts.limit === "number" ? Math.min(100, Math.max(1, opts.limit)) : 20;
  const offset = typeof opts.offset === "number" ? opts.offset : undefined;

  const url = new URL(`https://api.telegram.org/bot${botToken}/getUpdates`);
  url.searchParams.set("limit", String(limit));
  if (offset !== undefined) {
    url.searchParams.set("offset", String(offset));
  }

  try {
    const res = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const textRes = await res.text();
    let data: unknown = textRes;
    try {
      data = JSON.parse(textRes);
    } catch {
      /* fallback */
    }

    if (!res.ok || (typeof data === "object" && data && (data as Record<string, unknown>).ok === false)) {
      const desc = typeof data === "object" && data && "description" in data ? String((data as Record<string, unknown>).description) : textRes;
      return {
        ok: false,
        error: maskToken(`Falha ao buscar updates no Telegram: ${desc}`, botToken),
      };
    }

    const obj = data as Record<string, unknown>;
    const rawList = Array.isArray(obj.result) ? (obj.result as Record<string, unknown>[]) : [];

    // Security rule: Filter updates so ONLY messages from configuredChatId are kept. Other chats ignored silently.
    let filteredList = rawList;
    if (configuredChatId) {
      filteredList = rawList.filter((up) => {
        const upChatId = getUpdateChatId(up);
        return upChatId === configuredChatId;
      });
    }

    if (filteredList.length === 0) {
      const emptyMsg = configuredChatId
        ? `Nenhum update pendente do chat_id ${configuredChatId} no Telegram.`
        : "Nenhum update pendente no Telegram.";
      return {
        ok: true,
        output: maskToken(emptyMsg, botToken),
        rawData: data,
      };
    }

    const lines = filteredList.map((up, i) => {
      const updateId = String(up.update_id ?? "?");
      const msg = (up.message || up.edited_message) as Record<string, unknown> | undefined;
      const text = msg?.text ? String(msg.text) : "(sem texto)";
      const from = msg?.from as Record<string, unknown> | undefined;
      const sender = from?.username ? `@${from.username}` : String(from?.first_name || "usuário");
      const cId = getUpdateChatId(up) || "?";
      return `${i + 1}. [update \`${updateId}\`] ${sender} (chat \`${cId}\`): "${text}"`;
    });

    const output = `Updates do Telegram (${filteredList.length}):\n\n${lines.join("\n")}`;
    return {
      ok: true,
      output: maskToken(output, botToken),
      rawData: data,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Erro ao buscar updates no Telegram.";
    return {
      ok: false,
      error: maskToken(errMsg, botToken),
    };
  }
}

/** telegram.get_me API call */
export async function telegramGetMe(
  creds: TelegramCredentials
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const { botToken } = creds;

  try {
    const url = `https://api.telegram.org/bot${botToken}/getMe`;
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const textRes = await res.text();
    let data: unknown = textRes;
    try {
      data = JSON.parse(textRes);
    } catch {
      /* fallback */
    }

    if (!res.ok || (typeof data === "object" && data && (data as Record<string, unknown>).ok === false)) {
      const desc = typeof data === "object" && data && "description" in data ? String((data as Record<string, unknown>).description) : textRes;
      return {
        ok: false,
        error: maskToken(`Falha ao validar bot no Telegram: ${desc}`, botToken),
      };
    }

    const obj = data as Record<string, unknown>;
    const result = (obj.result ?? {}) as Record<string, unknown>;
    const username = String(result.username || result.first_name || "telegram-bot");
    const botId = String(result.id || "?");

    const output = `Bot do Telegram ativo: @${username} (id: \`${botId}\`).`;
    return {
      ok: true,
      output: maskToken(output, botToken),
      rawData: data,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Erro ao validar bot do Telegram.";
    return {
      ok: false,
      error: maskToken(errMsg, botToken),
    };
  }
}

/** Runner dispatcher for telegram tool */
export async function runTelegram(
  inputJson: string,
  userId: string,
  executionId?: string
): Promise<ToolResult> {
  const t0 = Date.now();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(inputJson) as Record<string, unknown>;
  } catch {
    parsed = { action: "send_message", text: inputJson };
  }

  const action = String(parsed.action || parsed.capability || "send_message");
  const capability = action === "send" ? "send_message" : action;

  // H9 — registro de capacidades (fail-closed).
  const blocked = capabilityBlockReason("telegram", capability);
  if (blocked) {
    return {
      ok: false,
      tool: "telegram",
      input: inputJson,
      error: blocked,
      durationMs: Date.now() - t0,
    };
  }

  const creds = await getTelegramCredentials(userId);
  if (!creds) {
    return {
      ok: false,
      tool: "telegram",
      input: inputJson,
      error: "Conector Telegram não conectado ou token ausente. Configure em Configurações → Conectores.",
      durationMs: Date.now() - t0,
    };
  }

  if (action === "send_message" || action === "send") {
    const text = String(parsed.text || parsed.message || "");
    const chatId = parsed.chat_id
      ? String(parsed.chat_id)
      : parsed.chatId
        ? String(parsed.chatId)
        : undefined;
    const gateId = parsed._gateId ? String(parsed._gateId) : undefined;
    const missionId = parsed.missionId ? String(parsed.missionId) : undefined;

    // H1 — mensagem outbound é efeito colateral real: exige write gate validado.
    const guard = await guardWrite({
      userId,
      provider: "telegram",
      capability: "send_message",
      target: chatId ? `chat:${chatId}` : `chat:${creds.chatId ?? "não-configurado"}`,
      summary: `Enviar mensagem no Telegram (${text.length} caracteres)`,
      payload: { text, chatId },
      contentPreview: text.slice(0, 200),
      missionId: missionId ?? null,
      executionId: executionId ?? null,
      gateId,
    });

    if (guard.kind === "refused") {
      return {
        ok: false,
        tool: "telegram",
        input: inputJson,
        error: guard.error,
        durationMs: Date.now() - t0,
      };
    }
    if (guard.kind === "gate_pending") {
      return {
        ok: true,
        tool: "telegram",
        input: inputJson,
        output: guard.output,
        durationMs: Date.now() - t0,
      };
    }

    const finalize: GateFinalize = guard.finalize;
    const res = await telegramSendMessage(creds, { text, chatId });
    const durationMs = Date.now() - t0;
    await finalize({
      ok: res.ok,
      output: res.ok ? res.output : null,
      error: res.ok ? null : res.error,
    });
    if (res.ok) {
      return {
        ok: true,
        tool: "telegram",
        input: inputJson,
        output: res.output,
        durationMs,
      };
    }
    return {
      ok: false,
      tool: "telegram",
      input: inputJson,
      error: res.error,
      durationMs,
    };
  }

  if (action === "get_updates" || action === "updates") {
    const offset = typeof parsed.offset === "number" ? parsed.offset : undefined;
    const limit = typeof parsed.limit === "number" ? parsed.limit : undefined;
    const res = await telegramGetUpdates(creds, { offset, limit });
    const durationMs = Date.now() - t0;
    if (res.ok) {
      return {
        ok: true,
        tool: "telegram",
        input: inputJson,
        output: res.output,
        durationMs,
      };
    }
    return {
      ok: false,
      tool: "telegram",
      input: inputJson,
      error: res.error,
      durationMs,
    };
  }

  if (action === "get_me" || action === "getMe" || action === "info") {
    const res = await telegramGetMe(creds);
    const durationMs = Date.now() - t0;
    if (res.ok) {
      return {
        ok: true,
        tool: "telegram",
        input: inputJson,
        output: res.output,
        durationMs,
      };
    }
    return {
      ok: false,
      tool: "telegram",
      input: inputJson,
      error: res.error,
      durationMs,
    };
  }

  return {
    ok: false,
    tool: "telegram",
    input: inputJson,
    error: `Ação não reconhecida no Telegram: '${action}'. Ações válidas: send_message, get_updates, get_me.`,
    durationMs: Date.now() - t0,
  };
}
