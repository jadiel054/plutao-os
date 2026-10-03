import type { ConnectorManifest } from "./types";

export const telegramManifest: ConnectorManifest = {
  provider: "telegram",
  displayName: "Telegram",
  description:
    "Bot do Telegram via Token do @BotFather. Envio de mensagens e leitura de updates com restrição de chat_id e token mascarado.",
  category: "comunicacao",
  authMode: "token",
  baseUrl: "https://api.telegram.org",
  defaultServerUrl: "https://api.telegram.org",
  headers: () => ({
    Accept: "application/json",
    "Content-Type": "application/json",
  }),
  tokenConfig: {
    url: "https://t.me/BotFather",
    label: "Token do Bot Telegram",
    placeholder: "Token do Bot (ex: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ)",
    verifyUrl: "https://api.telegram.org/bot{token}/getMe",
    extractUserLogin: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      const result = (obj.result ?? {}) as Record<string, unknown>;
      const username = String(result.username || result.first_name || result.id || "telegram-bot");
      return username.startsWith("@") ? username : `@${username}`;
    },
  },
  capabilities: [
    {
      name: "send_message",
      description: "Enviar mensagem para o chat do Telegram (chat_id padrão configurado)",
      mode: "read",
      request: {
        method: "POST",
        path: "/sendMessage",
      },
      requiredArgs: ["text"],
      intentKeywords: [
        "telegram",
        "enviar mensagem",
        "mandar mensagem",
        "send message",
        "notificar telegram",
        "telegram send",
      ],
    },
    {
      name: "get_updates",
      description: "Lê mensagens e updates pendentes no Telegram (filtrado por chat_id)",
      mode: "read",
      request: {
        method: "GET",
        path: "/getUpdates",
      },
      requiredArgs: [],
      intentKeywords: [
        "telegram updates",
        "ler telegram",
        "ouvir telegram",
        "ver mensagens telegram",
        "get_updates",
        "checar telegram",
      ],
    },
    {
      name: "get_me",
      description: "Obter informações e validar o bot do Telegram",
      mode: "read",
      request: {
        method: "GET",
        path: "/getMe",
      },
      requiredArgs: [],
      intentKeywords: [
        "bot info",
        "telegram bot",
        "get_me",
        "status telegram",
        "validar bot",
      ],
    },
  ],
};
