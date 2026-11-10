import { describe, expect, it } from "vitest";
import * as mcpTools from "../tools";

describe("MCP message-write capability", () => {
  it("exposes the text-only tool implementation; routing must still require mcp:write", () => {
    expect(typeof mcpTools.toolSendMessage).toBe("function");
    expect(typeof mcpTools.withMcpGuards).toBe("function");
  });
});
