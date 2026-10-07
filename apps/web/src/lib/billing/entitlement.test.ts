import { describe, expect, it } from "vitest";
import { planFieldForBillingEvent } from "./entitlement";

describe("protected plan entitlement", () => {
  it("does not let a billing event overwrite a locked plan", () => {
    expect(planFieldForBillingEvent("orbita_livre", true)).toEqual({});
    expect(planFieldForBillingEvent("caronte", true)).toEqual({});
  });

  it("keeps normal billing plan synchronization for unlocked users", () => {
    expect(planFieldForBillingEvent("caronte", false)).toEqual({ plan: "caronte" });
    expect(planFieldForBillingEvent("orbita_livre", false)).toEqual({ plan: "orbita_livre" });
  });

  it("supports the owner entitlement without encoding an email in application code", () => {
    expect(planFieldForBillingEvent("constelacao", true)).toEqual({});
  });
});
