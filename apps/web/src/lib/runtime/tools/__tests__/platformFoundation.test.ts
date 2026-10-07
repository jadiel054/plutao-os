import { describe, expect, it } from "vitest";
import { evaluateArtifact } from "../artifactEvaluator";
import { browserCapabilityStatus, planBrowserAction, validateBrowserUrl } from "../browser";

describe("platform foundation", () => {
  it("blocks dangerous browser URLs and credentials", () => {
    expect(validateBrowserUrl("file:///etc/passwd")).toBeNull();
    expect(validateBrowserUrl("http://127.0.0.1:3000")).toBeNull();
    expect(validateBrowserUrl("https://user:pass@example.com")).toBeNull();
    expect(planBrowserAction({ type: "navigate", url: "https://example.com" }, 0).allowed).toBe(true);
  });

  it("limits browser steps and unsafe selectors", () => {
    expect(planBrowserAction({ type: "screenshot" }, 20)).toMatchObject({ allowed: false, code: "BROWSER_STEP_LIMIT" });
    expect(planBrowserAction({ type: "extract", selector: "<script>" }, 0)).toMatchObject({ allowed: false, code: "BROWSER_SELECTOR_BLOCKED" });
  });

  it("does not pretend a browser backend is configured", () => {
    expect(browserCapabilityStatus()).toMatchObject({ enabled: false, backend: null });
  });

  it("detects exposed secrets and invalid JSON", () => {
    const result = evaluateArtifact({
      name: "config.json",
      type: "application/json",
      content: '{"key":"sk-12345678901234567890"',
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((check) => check.id === "json_valid" && !check.passed)).toBe(true);
  });

  it("accepts a safe artifact and rejects dangerous HTML", () => {
    expect(evaluateArtifact({ name: "readme.md", content: "# Plutão\n\nTudo certo." }).ok).toBe(true);
    expect(evaluateArtifact({ name: "index.html", type: "text/html", content: "<script>alert(1)</script>" }).ok).toBe(false);
  });
});
