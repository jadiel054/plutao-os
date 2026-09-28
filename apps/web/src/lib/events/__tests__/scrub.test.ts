import { describe, expect, it } from "vitest";
import { scrubText, scrubValue, buildTruncatedPreview } from "../scrub";
import { ARTIFACT_CHAR_THRESHOLD } from "../types";

describe("scrubText", () => {
  it("redacts sk-test tokens so they never appear", () => {
    const raw = "use key sk-test_51ABCDEFghijklmnop and continue";
    const out = scrubText(raw);
    expect(out.toLowerCase()).not.toContain("sk-test_51");
    expect(out).toMatch(/redacted|\*\*\*\*/i);
  });

  it("redacts ghp_ github pats", () => {
    const raw = "token ghp_abcdefghijklmnopqrstuvwx1234567890";
    const out = scrubText(raw);
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwx1234567890");
  });

  it("redacts nested payload strings", () => {
    const v = scrubValue({
      tool: "github",
      input: "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz012345",
    }) as Record<string, unknown>;
    const s = JSON.stringify(v);
    expect(s).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz012345/);
  });
});

describe("buildTruncatedPreview", () => {
  it("keeps short text intact", () => {
    const r = buildTruncatedPreview("hello world");
    expect(r.truncated).toBe(false);
    expect(r.preview).toBe("hello world");
  });

  it("truncates long text with char count marker", () => {
    const full = "A".repeat(ARTIFACT_CHAR_THRESHOLD + 100);
    const r = buildTruncatedPreview(full);
    expect(r.truncated).toBe(true);
    expect(r.charCount).toBe(full.length);
    expect(r.preview).toContain(`Full output (${full.length} chars) saved`);
    expect(r.preview.length).toBeLessThan(full.length);
  });
});
