import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  githubPullsCreate,
  githubPullsList,
  githubPullsGet,
  githubPullsMergeNotice,
} from "../githubPulls";

describe("githubPulls", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("githubPullsCreate", () => {
    it("fails when head branch does not exist", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: "Not Found" }),
      } as Response);

      const res = await githubPullsCreate("test-token", {
        owner: "user",
        repo: "my-repo",
        title: "New PR",
        head: "non-existent-head",
        base: "main",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Branch de origem (head) 'non-existent-head' não encontrada");
      }
    });

    it("fails when base branch does not exist", async () => {
      global.fetch = vi
        .fn()
        // head exists
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ object: { sha: "head123" } }),
        } as Response)
        // base does not exist
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ message: "Not Found" }),
        } as Response);

      const res = await githubPullsCreate("test-token", {
        owner: "user",
        repo: "my-repo",
        title: "New PR",
        head: "feature-branch",
        base: "non-existent-base",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Branch de destino (base) 'non-existent-base' não encontrada");
      }
    });

    it("creates pull request successfully when both branches exist", async () => {
      global.fetch = vi
        .fn()
        // head exists
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ object: { sha: "head123" } }),
        } as Response)
        // base exists
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ object: { sha: "base123" } }),
        } as Response)
        // create PR
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              number: 42,
              html_url: "https://github.com/user/my-repo/pull/42",
            }),
        } as Response);

      const res = await githubPullsCreate("test-token", {
        owner: "user",
        repo: "my-repo",
        title: "Feature X",
        head: "feature-x",
        base: "main",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.number).toBe(42);
        expect(res.htmlUrl).toBe("https://github.com/user/my-repo/pull/42");
        expect(res.output).toContain("Pull Request #42 aberto com sucesso");
      }
    });
  });

  describe("githubPullsGet", () => {
    it("returns PR details including additions, deletions, mergeable, and reviewers", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            number: 10,
            title: "Refactor API",
            body: "PR body content",
            state: "open",
            head: { ref: "refactor-api" },
            base: { ref: "main" },
            html_url: "https://github.com/user/my-repo/pull/10",
            additions: 150,
            deletions: 30,
            mergeable: true,
            requested_reviewers: [{ login: "reviewer1" }, { login: "reviewer2" }],
          }),
      } as Response);

      const res = await githubPullsGet("test-token", {
        owner: "user",
        repo: "my-repo",
        number: 10,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.pr.number).toBe(10);
        expect(res.pr.additions).toBe(150);
        expect(res.pr.deletions).toBe(30);
        expect(res.pr.mergeable).toBe(true);
        expect(res.pr.reviewers).toEqual(["reviewer1", "reviewer2"]);
        expect(res.output).toContain("Adições: +150 | Remoções: -30");
      }
    });
  });

  describe("githubPullsMergeNotice", () => {
    it("returns human merge policy explanation", () => {
      const notice = githubPullsMergeNotice();
      expect(notice).toContain("Operações de merge não são executadas automaticamente");
      expect(notice).toContain("manualmente por um humano no GitHub");
    });
  });
});
