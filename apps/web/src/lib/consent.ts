export const CONSENT_POLICY_VERSION = "2026-10-05";

export const CONSENT_SCOPES = [
  "service_notifications",
  "marketing",
  "device_analysis",
] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export type ConsentState = Record<ConsentScope, boolean>;

export const EMPTY_CONSENTS: ConsentState = {
  service_notifications: false,
  marketing: false,
  device_analysis: false,
};

export function isConsentScope(value: unknown): value is ConsentScope {
  return typeof value === "string" && (CONSENT_SCOPES as readonly string[]).includes(value);
}
