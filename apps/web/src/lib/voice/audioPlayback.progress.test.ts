import { describe, it, expect } from "vitest";
import {
  formatPlaybackClock,
  float32DurationMs,
  elapsedFromContext,
} from "./audioPlayback";

describe("formatPlaybackClock", () => {
  it("formats zero", () => {
    expect(formatPlaybackClock(0)).toBe("00:00");
  });
  it("formats under a minute", () => {
    expect(formatPlaybackClock(3500)).toBe("00:03");
  });
  it("formats minutes and seconds", () => {
    expect(formatPlaybackClock(15_000)).toBe("00:15");
    expect(formatPlaybackClock(65_000)).toBe("01:05");
  });
  it("floors partial seconds", () => {
    expect(formatPlaybackClock(1999)).toBe("00:01");
  });
  it("clamps negative", () => {
    expect(formatPlaybackClock(-100)).toBe("00:00");
  });
});

describe("float32DurationMs", () => {
  it("computes duration from samples and rate", () => {
    expect(float32DurationMs(24_000, 24_000)).toBe(1000);
    expect(float32DurationMs(48_000, 16_000)).toBe(3000);
  });
  it("returns 0 for invalid inputs", () => {
    expect(float32DurationMs(0, 24000)).toBe(0);
    expect(float32DurationMs(100, 0)).toBe(0);
  });
});

describe("elapsedFromContext", () => {
  it("computes elapsed from AudioContext times", () => {
    expect(elapsedFromContext(1.5, 0.5)).toBe(1000);
  });
  it("clamps negative drift", () => {
    expect(elapsedFromContext(0.1, 0.5)).toBe(0);
  });
});
