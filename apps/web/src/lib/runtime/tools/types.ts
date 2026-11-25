export type ToolName =
  | "note"
  | "filesystem"
  | "process"
  | "github"
  | "vercel"
  | "supabase"
  | "telegram"
  | "cloudflare"
  | "render"
  | "artemis"
  | "maestro"
  | "appium"
  | "playwright"
  | "androidworld"
  | "computer"
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
  /** Dica acionável devolvida ao modelo para autorrecuperação (ex.: usar caminho relativo). */
  message?: string;
  durationMs: number;
};

export type ToolResult = ToolSuccess | ToolFailure;

export const KNOWN_TOOLS: readonly ToolName[] = [
  "computer",
  "note",
  "filesystem",
  "process",
  "github",
  "vercel",
  "supabase",
  "telegram",
  "cloudflare",
  "render",
  "artemis",
  "maestro",
  "appium",
  "playwright",
  "androidworld",
  "files.export_pdf",
  "files.export_xlsx",
  "files.export_markdown",
  "files.export_html",
];

export function isToolName(v: string): v is ToolName {
  return (KNOWN_TOOLS as readonly string[]).includes(v as ToolName);
}
