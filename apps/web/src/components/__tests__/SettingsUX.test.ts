import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Settings UX Package & Connectors Feedback", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Tab Resolution Logic", () => {
    const VALID_TABS = ["ia", "conectores", "voz", "perfil", "notificacoes", "seguranca", "sobre"];

    function resolveInitialTab(search: string): string {
      const params = new URLSearchParams(search);
      const tabParam = params.get("tab");
      if (tabParam && VALID_TABS.includes(tabParam)) {
        localStorage.setItem("plutao_settings_tab", tabParam);
        return tabParam;
      }
      const storedTab = localStorage.getItem("plutao_settings_tab");
      if (storedTab && VALID_TABS.includes(storedTab)) {
        return storedTab;
      }
      return "ia";
    }

    it("prioritizes ?tab= from URL over localStorage and defaults", () => {
      localStorage.setItem("plutao_settings_tab", "voz");
      expect(resolveInitialTab("?tab=conectores")).toBe("conectores");
      expect(localStorage.getItem("plutao_settings_tab")).toBe("conectores");
    });

    it("falls back to localStorage when ?tab= is missing from URL", () => {
      localStorage.setItem("plutao_settings_tab", "perfil");
      expect(resolveInitialTab("")).toBe("perfil");
    });

    it("defaults to 'ia' when no URL query and no localStorage entry exist", () => {
      expect(resolveInitialTab("")).toBe("ia");
    });

    it("ignores invalid tab parameter in URL and uses stored fallback", () => {
      localStorage.setItem("plutao_settings_tab", "seguranca");
      expect(resolveInitialTab("?tab=invalid_tab")).toBe("seguranca");
    });
  });

  describe("Connector Query Feedback Parsing", () => {
    const PROVIDER_NAMES: Record<string, string> = {
      github: "GitHub",
      vercel: "Vercel",
      neon: "Neon",
      stripe: "Stripe",
      supabase: "Supabase",
      telegram: "Telegram",
      cloudflare: "Cloudflare",
      render: "Render",
    };

    function parseConnectorFeedback(urlStr: string) {
      const url = new URL(urlStr);
      const ok = url.searchParams.get("connector_ok");
      const err = url.searchParams.get("connector_error");

      if (!ok && !err) return null;

      url.searchParams.delete("connector_ok");
      url.searchParams.delete("connector_error");

      if (ok) {
        const providerName = PROVIDER_NAMES[ok.toLowerCase()] || (ok.charAt(0).toUpperCase() + ok.slice(1));
        return {
          type: "success",
          message: `${providerName} conectado ✅`,
          cleanUrl: url.pathname + (url.search ? `?${url.searchParams}` : "") + url.hash,
        };
      }

      if (err) {
        const decoded = decodeURIComponent(err);
        let msg = decoded;
        const lowerDecoded = decoded.toLowerCase();
        if (PROVIDER_NAMES[lowerDecoded]) {
          msg = `Falha ao conectar ${PROVIDER_NAMES[lowerDecoded]} — tente novamente`;
        } else if (!decoded.startsWith("Falha") && !decoded.includes("tente novamente")) {
          msg = `Falha ao conectar: ${decoded} — tente novamente`;
        }
        return {
          type: "error",
          message: msg,
          cleanUrl: url.pathname + (url.search ? `?${url.searchParams}` : "") + url.hash,
        };
      }

      return null;
    }

    it("formats success message correctly and preserves ?tab=conectores in URL", () => {
      const res = parseConnectorFeedback("http://localhost/configuracoes?tab=conectores&connector_ok=github");
      expect(res).not.toBeNull();
      expect(res?.type).toBe("success");
      expect(res?.message).toBe("GitHub conectado ✅");
      expect(res?.cleanUrl).toBe("/configuracoes?tab=conectores");
    });

    it("formats error message for provider key and cleans query", () => {
      const res = parseConnectorFeedback("http://localhost/configuracoes?tab=conectores&connector_error=vercel");
      expect(res).not.toBeNull();
      expect(res?.type).toBe("error");
      expect(res?.message).toBe("Falha ao conectar Vercel — tente novamente");
      expect(res?.cleanUrl).toBe("/configuracoes?tab=conectores");
    });

    it("formats raw error message cleanly", () => {
      const res = parseConnectorFeedback("http://localhost/configuracoes?tab=conectores&connector_error=STATE_MISMATCH");
      expect(res).not.toBeNull();
      expect(res?.type).toBe("error");
      expect(res?.message).toBe("Falha ao conectar: STATE_MISMATCH — tente novamente");
      expect(res?.cleanUrl).toBe("/configuracoes?tab=conectores");
    });
  });

  describe("Error Card & Authorizing Double-Submit Protection Logic", () => {
    type Status = "disconnected" | "authorizing" | "connected" | "reconnecting" | "error";

    function getButtonState(status: Status, busy: string | null, provider: string, authMode: "oauth" | "token") {
      const isConnected = status === "connected";
      const isError = status === "error";
      const isAuthorizing = busy === provider || status === "authorizing";

      if (isConnected) {
        return { disabled: busy !== null, text: authMode === "oauth" ? "Reconectar" : "Atualizar Key" };
      }

      if (authMode === "oauth") {
        return {
          disabled: busy !== null || isAuthorizing,
          text: isAuthorizing ? "Autorizando…" : isError ? "Tentar novamente" : "Conectar OAuth",
          isHighlighted: isError,
        };
      }

      return {
        disabled: busy !== null,
        text: isError ? "Tentar novamente" : "Colar Token / Key",
        isHighlighted: isError,
      };
    }

    it("disables OAuth button when status is authorizing or busy", () => {
      const state1 = getButtonState("authorizing", null, "github", "oauth");
      expect(state1.disabled).toBe(true);
      expect(state1.text).toBe("Autorizando…");

      const state2 = getButtonState("disconnected", "github", "github", "oauth");
      expect(state2.disabled).toBe(true);
      expect(state2.text).toBe("Autorizando…");
    });

    it("shows highlighted 'Tentar novamente' button when status is error", () => {
      const state = getButtonState("error", null, "vercel", "oauth");
      expect(state.disabled).toBe(false);
      expect(state.text).toBe("Tentar novamente");
      expect(state.isHighlighted).toBe(true);
    });
  });
});
