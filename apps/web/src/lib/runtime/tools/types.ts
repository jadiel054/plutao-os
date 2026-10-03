export type ToolName =
  | "note"
  | "filesystem"
  | "github"
  | "vercel"
  | "supabase"
  | "telegram"
  | "files.export_pdf"
  | "files.export_xlsx"
  | "files.export_markdown"
  | "files.export_html";

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

export const KNOWN_TOOLS: readonly ToolName[] = [
  "note",
  "filesystem",
  "github",
  "vercel",
  "supabase",
  "telegram",
  "files.export_pdf",
  "files.export_xlsx",
  "files.export_markdown",
  "files.export_html",
];

export function isToolName(v: string): v is ToolName {
  return (KNOWN_TOOLS as readonly string[]).includes(v as ToolName);
}
