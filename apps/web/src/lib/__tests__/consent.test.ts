import { describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION, CONSENT_SCOPES, EMPTY_CONSENTS, isConsentScope } from "@/lib/consent";

describe("consentimentos granulares", () => {
  it("mantém três escopos independentes desligados por padrão", () => {
    expect(CONSENT_SCOPES).toEqual(["service_notifications", "marketing", "device_analysis"]);
    expect(EMPTY_CONSENTS).toEqual({
      service_notifications: false,
      marketing: false,
      device_analysis: false,
    });
  });

  it("aceita somente escopos conhecidos", () => {
    expect(isConsentScope("marketing")).toBe(true);
    expect(isConsentScope("terms_of_use")).toBe(false);
    expect(isConsentScope(null)).toBe(false);
  });

  it("usa uma versão de política explícita", () => {
    expect(CONSENT_POLICY_VERSION).toMatch(/^2026-10-05$/);
  });
});
