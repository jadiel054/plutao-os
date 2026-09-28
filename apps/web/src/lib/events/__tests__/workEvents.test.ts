import { describe, expect, it } from "vitest";
import { filterWorkEvents, isWorkEventType } from "../workEvents";

describe("G3 work event filter", () => {
  it("keeps action/observation/plan/state_update only", () => {
    const events = [
      { type: "user_message", seq: 1 },
      { type: "action", seq: 2 },
      { type: "assistant_message", seq: 3 },
      { type: "observation", seq: 4 },
      { type: "plan", seq: 5 },
      { type: "state_update", seq: 6 },
    ];
    const work = filterWorkEvents(events);
    expect(work.map((e) => e.type)).toEqual([
      "action",
      "observation",
      "plan",
      "state_update",
    ]);
    expect(work.every((e) => isWorkEventType(e.type))).toBe(true);
  });

  it("rejects chat message types", () => {
    expect(isWorkEventType("user_message")).toBe(false);
    expect(isWorkEventType("assistant_message")).toBe(false);
    expect(isWorkEventType("action")).toBe(true);
  });
});
