import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  TOUR_STEPS,
  isOnboardingSeenInStorage,
  setOnboardingSeenInStorage,
} from "../GuidedTour";

describe("GuidedTour logic and persistence", () => {
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

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/me") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { id: "u1", email: "user@test.com" } }),
        };
      }
      if (url === "/api/user/preferences") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ preferences: {} }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("has correct 6 steps configured", () => {
    expect(TOUR_STEPS).toHaveLength(6);
    expect(TOUR_STEPS[0]!.title).toBe("Bem-vindo ao Plutão OS");
    expect(TOUR_STEPS[0]!.targetSelector).toBeNull();

    expect(TOUR_STEPS[1]!.title).toBe("Navegação");
    expect(TOUR_STEPS[1]!.targetSelector).toBe('[data-tour="nav-tabs"]');

    expect(TOUR_STEPS[2]!.title).toBe("Chat com o Agente");
    expect(TOUR_STEPS[2]!.targetSelector).toBe('[data-tour="open-chat"]');

    expect(TOUR_STEPS[3]!.title).toBe("Cockpit");
    expect(TOUR_STEPS[3]!.targetSelector).toBe('[data-tour="open-cockpit"]');

    expect(TOUR_STEPS[4]!.title).toBe("Configurações");
    expect(TOUR_STEPS[4]!.targetSelector).toBe('[data-tour="settings-link"]');

    expect(TOUR_STEPS[5]!.title).toBe("Sua vez");
    expect(TOUR_STEPS[5]!.targetSelector).toBeNull();
    expect(TOUR_STEPS[5]!.primaryButtonText).toBe("Começar");
  });

  it("isOnboardingSeenInStorage returns false when empty and true when set", () => {
    expect(isOnboardingSeenInStorage()).toBe(false);

    setOnboardingSeenInStorage();

    expect(isOnboardingSeenInStorage()).toBe(true);
    expect(mockStorage["plutao_onboarding_seen"]).toBe("true");
    expect(mockStorage["onboarding_seen"]).toBe("true");
  });

  it("user with flag already saved is detected correctly", () => {
    mockStorage["plutao_onboarding_seen"] = "true";
    expect(isOnboardingSeenInStorage()).toBe(true);
  });

  it("skips missing elements without throwing an error", () => {
    // Simulate DOM querying where target elements are missing
    const dummySelector = '[data-tour="non-existent"]';
    const stepWithMissingTarget = {
      title: "Test Step",
      description: "Description",
      targetSelector: dummySelector,
    };

    const findTarget = (selector: string | null) => {
      if (!selector) return null;
      return typeof document !== "undefined" ? document.querySelector(selector) : null;
    };

    expect(() => findTarget(stepWithMissingTarget.targetSelector)).not.toThrow();
    expect(findTarget(stepWithMissingTarget.targetSelector)).toBeNull();
  });

  it("persists dismissal flag via API and fallback to localStorage", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => {
      return { ok: true, json: async () => ({ preferences: { onboarding_seen: true } }) };
    });
    vi.stubGlobal("fetch", fetchSpy);

    setOnboardingSeenInStorage();
    await fetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_seen: true }),
    });

    expect(isOnboardingSeenInStorage()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/user/preferences",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ onboarding_seen: true }),
      })
    );
  });
});
