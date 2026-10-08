import { describe, expect, it } from "vitest";
import * as mcpTools from "../tools";

describe("MCP read-only contract", () => {
  it("does not expose the old message-writing tool", () => {
    expect("toolSendMessage" in mcpTools).toBe(false);
  });
});
