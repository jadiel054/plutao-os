import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  maskToken,
  telegramSendMessage,
  telegramGetUpdates,
  telegramGetMe,
  runTelegram,
} from "../../runtime/tools/telegram";
import { verifyToken } from "../connectorOAuth";
import * as connectorsService from "../service";

vi.mock("../service", () => ({
  getConnectorRow: vi.fn(),
  getAccessToken: vi.fn(),
}));

describe("Telegram Connector & Tool Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("maskToken", () => {
    it("masks specific bot token passed to function", () => {
      const token = "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ";
      const text = `Erro ao chamar https://api.telegram.org/bot${token}/sendMessage`;
      const masked = maskToken(text, token);
      expect(masked).not.toContain(token);
      expect(masked).toContain("123456...***");
    });

    it("masks general Telegram bot token pattern in text", () => {
      const text = "A chave bot987654321:XYZabcdef1234567890123456789012345 foi encontrada";
      const masked = maskToken(text);
      expect(masked).not.toContain("bot987654321:XYZ");
      expect(masked).toContain("bot<TOKEN_MASKED>");
    });
  });

  describe("verifyToken (Telegram)", () => {
    it("successfully verifies valid Telegram bot token via /getMe", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            id: 123456,
            is_bot: true,
            first_name: "PlutaoBot",
            username: "plutao_os_bot",
          },
        }),
      } as Response);

      const res = await verifyToken("telegram", "123456789:ValidToken");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.login).toBe("@plutao_os_bot");
      }
    });

    it("fails verification when Telegram API returns ok: false", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          error_code: 401,
          description: "Unauthorized: bot token is invalid",
        }),
      } as Response);

      const res = await verifyToken("telegram", "invalid:token");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Unauthorized: bot token is invalid");
      }
    });
  });

  describe("telegramSendMessage", () => {
    it("uses default configured chatId when opts.chatId is not provided", async () => {
      let requestBody: Record<string, unknown> = {};
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        requestBody = JSON.parse(opts.body as string);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, result: { message_id: 42 } }),
        } as Response;
      });

      const res = await telegramSendMessage(
        { botToken: "123:TOKEN", chatId: "998877" },
        { text: "Olá do Plutão!" }
      );

      expect(res.ok).toBe(true);
      expect(requestBody.chat_id).toBe("998877");
      expect(requestBody.text).toBe("Olá do Plutão!");
    });

    it("restricts sending strictly to configured chatId if an explicit differing chatId is provided", async () => {
      let requestBody: Record<string, unknown> = {};
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        requestBody = JSON.parse(opts.body as string);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, result: { message_id: 43 } }),
        } as Response;
      });

      const res = await telegramSendMessage(
        { botToken: "123:TOKEN", chatId: "112233" },
        { text: "Mensagem restrita", chatId: "999999_ESTRANHO" }
      );

      expect(res.ok).toBe(true);
      expect(requestBody.chat_id).toBe("112233"); // Enforces configured chatId
    });

    it("returns error if chatId is missing both in config and options", async () => {
      const res = await telegramSendMessage(
        { botToken: "123:TOKEN", chatId: null },
        { text: "Mensagem sem chat" }
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("chat_id do Telegram não configurado");
      }
    });
  });

  describe("telegramGetUpdates", () => {
    it("filters out updates from unauthorized/strange chat_ids silently", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 101,
                message: {
                  message_id: 1,
                  from: { username: "user_autorizado", first_name: "Alice" },
                  chat: { id: 100200300 },
                  text: "/start do usuário correto",
                },
              },
              {
                update_id: 102,
                message: {
                  message_id: 2,
                  from: { username: "spammer_estranho", first_name: "Bob" },
                  chat: { id: 999999999 }, // Strange chat_id
                  text: "spam malicioso",
                },
              },
            ],
          }),
      } as Response);

      const res = await telegramGetUpdates({ botToken: "123:TOKEN", chatId: "100200300" });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("update `101`");
        expect(res.output).toContain("/start do usuário correto");
        expect(res.output).not.toContain("102");
        expect(res.output).not.toContain("spam malicioso");
      }
    });
  });

  describe("runTelegram Tool Dispatcher", () => {
    it("executes get_me action successfully", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue({
        id: "conn-tg-1",
        userId: "user-1",
        provider: "telegram",
        status: "connected",
        serverUrl: null,
        accountLogin: "@test_bot",
        accountLabel: "Test Bot",
        scopes: [],
        capabilities: [],
        accessTokenEnc: "enc",
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        oauthState: null,
        lastError: null,
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("123456789:SecretToken");

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: { id: 555, is_bot: true, first_name: "PlutaoBot", username: "plutao_bot" },
          }),
      } as Response);

      const res = await runTelegram(JSON.stringify({ action: "get_me" }), "user-1");

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.output).toContain("Bot do Telegram ativo: @plutao_bot");
        expect(res.output).not.toContain("SecretToken");
      }
    });

    it("returns error if connector is disconnected", async () => {
      vi.spyOn(connectorsService, "getConnectorRow").mockResolvedValue(null as never);

      const res = await runTelegram(
        JSON.stringify({ action: "send_message", text: "teste" }),
        "user-1"
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Conector Telegram não conectado");
      }
    });
  });
});
