import { describe, expect, it } from "vitest";
import {
  formatKokoroProgressDetail,
  formatPackError,
  formatPiperProgressDetail,
  PackDownloadError,
} from "../packErrors";

describe("formatKokoroProgressDetail", () => {
  it("does not surface literal progress", () => {
    const d = formatKokoroProgressDetail({ status: "progress", progress: 42 }, 42);
    expect(d.toLowerCase()).not.toBe("progress");
    expect(d).not.toMatch(/^progress$/i);
    expect(d).toMatch(/Kokoro/);
    expect(d).toMatch(/42%/);
  });

  it("includes file name when present", () => {
    const d = formatKokoroProgressDetail(
      { status: "progress", file: "onnx/model_q8.onnx", progress: 10 },
      10
    );
    expect(d).toContain("model_q8.onnx");
    expect(d).toContain("10%");
  });
});

describe("formatPackError", () => {
  it("wraps network error with pack name", () => {
    const msg = formatPackError({
      packId: "kokoro-en",
      packName: "Inglês (Kokoro)",
      file: "Kokoro-82M",
      phase: "download",
      cause: new Error("network error"),
    });
    expect(msg).toMatch(/Kokoro/);
    expect(msg).toMatch(/network error/i);
    expect(msg).toMatch(/Kokoro-82M/);
  });

  it("PackDownloadError message matches formatPackError", () => {
    const err = new PackDownloadError({
      packId: "piper-pt-br",
      packName: "Português BR (Piper)",
      file: "pt_BR-faber-medium",
      phase: "download",
      cause: new Error("network error"),
    });
    expect(err.message).toMatch(/Piper/);
    expect(err.message).toMatch(/network error/i);
    expect(err.packId).toBe("piper-pt-br");
  });
});

describe("formatPiperProgressDetail", () => {
  it("includes voice id and pct", () => {
    expect(formatPiperProgressDetail(55, "pt_BR-faber-medium")).toBe(
      "Piper · pt_BR-faber-medium · 55%"
    );
  });
});
