import { describe, it, expect, vi } from "vitest";
import {
  detectGitHubToolAction,
  detectAndExecuteGitHubTool,
  GITHUB_REQUIRED_ARGS,
} from "../githubToolRunner";
import { VERCEL_REQUIRED_ARGS } from "../vercelToolRunner";
import * as githubTools from "@/lib/runtime/tools/github";

vi.mock("@/lib/runtime/tools/github", () => ({
  runGithub: vi.fn(),
}));

describe("Required Args Validation", () => {
  it("defines correct required arguments for GitHub capabilities", () => {
    expect(GITHUB_REQUIRED_ARGS.repos_list).toEqual([]);
    expect(GITHUB_REQUIRED_ARGS.repo_get).toEqual(["owner", "repo"]);
    expect(GITHUB_REQUIRED_ARGS.issues_list).toEqual(["owner", "repo"]);
    expect(GITHUB_REQUIRED_ARGS.issues_get).toEqual(["owner", "repo", "number"]);
    expect(GITHUB_REQUIRED_ARGS.pulls_list).toEqual(["owner", "repo"]);
    expect(GITHUB_REQUIRED_ARGS.actions_list).toEqual(["owner", "repo"]);
  });

  it("defines required arguments for Vercel capabilities", () => {
    expect(VERCEL_REQUIRED_ARGS.projects_list).toEqual([]);
    expect(VERCEL_REQUIRED_ARGS.deployments_list).toEqual(["projectId"]);
  });

  it("detects GitHub issues_list without repo and triggers missingArgs clarification without error card trace", async () => {
    const mockRunGithub = vi.mocked(githubTools.runGithub);
    mockRunGithub.mockResolvedValueOnce({
      ok: true,
      tool: "github",
      input: '{"action":"repos_list","per_page":3}',
      output: "- owner/plutao-os (public)\n- owner/web-app (private)\n- owner/api-service (public)",
      durationMs: 42,
    });

    const actionPlan = detectGitHubToolAction("liste issues dos meus repositórios", "jadiel054");
    expect(actionPlan).not.toBeNull();
    expect(actionPlan?.action).toBe("issues_list");
    expect(actionPlan?.owner).toBe("jadiel054");
    expect(actionPlan?.repo).toBeUndefined();

    const result = await detectAndExecuteGitHubTool({
      text: "liste issues dos meus repositórios",
      userId: "user_123",
      githubLogin: "jadiel054",
    });

    expect(result.executed).toBe(false);
    expect(result.missingArgs).toBe(true);
    expect(result.trace).toBeUndefined(); // NO error trace -> NO red ActionCard!
    expect(result.contextText).toContain("ESCLARECIMENTO DE PARÂMETROS - GITHUB");
    expect(result.contextText).toContain("plutao-os");

    expect(result.suggestedFollowUps).toHaveLength(3);
    expect(result.suggestedFollowUps?.[0].label).toBe("plutao-os");
    expect(result.suggestedFollowUps?.[0].prompt).toBe("liste as issues abertas de plutao-os");
  });
});
