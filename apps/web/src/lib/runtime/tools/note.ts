import type { ToolResult } from "./types";

/**
 * Deterministic local tool: normalizes a note string.
 * No network, no filesystem — pipeline proof only.
 */
export function runNote(input: string): ToolResult {
  const start = Date.now();
  const normalized = String(input ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      ok: false,
      tool: "note",
      input: String(input ?? ""),
      error: "input vazio",
      durationMs: Date.now() - start,
    };
  }
  if (normalized.length > 4000) {
    return {
      ok: false,
      tool: "note",
      input: normalized.slice(0, 64) + "…",
      error: "input excede 4000 caracteres",
      durationMs: Date.now() - start,
    };
  }
  return {
    ok: true,
    tool: "note",
    input: normalized,
    output: normalized,
    durationMs: Date.now() - start,
  };
}
