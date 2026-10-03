import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../missionPrompt";

describe("System prompt do runtime de missões inclui conectores e write gates", () => {
  const connectorBlock = [
    "github: CONNECTED (login: test-user)",
    "  read: repos_list, issues_list",
    "  write (gated): repo_create, push_files, prs_create",
    "vercel: CONNECTED",
    "  write (gated): project_create, deploy_create",
  ].join("\n");

  it("lista tools de conectores (github, vercel, supabase, ...)", () => {
    const prompt = buildSystemPrompt(null, connectorBlock, "mission-123");
    for (const t of ["github", "vercel", "supabase", "telegram", "cloudflare", "render"]) {
      expect(prompt).toContain(t);
    }
  });

  it("inclui ações de escrita gated (repo_create, push_files, project_create, deploy_create)", () => {
    const prompt = buildSystemPrompt(null, connectorBlock, "mission-123");
    for (const a of ["repo_create", "push_files", "project_create", "deploy_create", "GATE_PENDING"]) {
      expect(prompt).toContain(a);
    }
  });

  it("inclui o missionId e o bloco de conectores", () => {
    const prompt = buildSystemPrompt(null, connectorBlock, "mission-123");
    expect(prompt).toContain("mission-123");
    expect(prompt).toContain("vercel: CONNECTED");
  });

  it("mantém tools base (note, filesystem, files.export_pdf)", () => {
    const prompt = buildSystemPrompt(null, connectorBlock, "mission-123");
    expect(prompt).toContain("note");
    expect(prompt).toContain("filesystem");
    expect(prompt).toContain("files.export_pdf");
  });
});
