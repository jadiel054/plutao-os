export type ToolName = "note";

export type ToolInput = {
  name: ToolName;
  input: string;
};

export type ToolSuccess = {
  ok: true;
  tool: ToolName;
  input: string;
  output: string;
  durationMs: number;
};

export type ToolFailure = {
  ok: false;
  tool: string;
  input: string;
  error: string;
  durationMs: number;
};

export type ToolResult = ToolSuccess | ToolFailure;

export const KNOWN_TOOLS: readonly ToolName[] = ["note"];

export function isToolName(v: string): v is ToolName {
  return (KNOWN_TOOLS as readonly string[]).includes(v);
}
