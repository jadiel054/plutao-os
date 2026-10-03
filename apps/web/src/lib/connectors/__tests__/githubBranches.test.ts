import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  githubBranchesList,
  githubBranchesCreate,
  isValidBranchName,
} from "../githubBranches";

describe("githubBranches", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("isValidBranchName", () => {
    it("accepts valid branch names", () => {
      expect(isValidBranchName("main")).toBe(true);
      expect(isValidBranchName("feature/jira-123")).toBe(true);
      expect(isValidBranchName("fix_bug.v1")).toBe(true);
    });

    it("rejects invalid branch names containing spaces or invalid chars or '..'", () => {
      expect(isValidBranchName("")).toBe(false);
      expect(isValidBranchName("feat..123")).toBe(false);
      expect(isValidBranchName("feature branch")).toBe(false);
      expect(isValidBranchName("feat~1")).toBe(false);
      expect(isValidBranchName("feat^2")).toBe(false);
    });
  });

  describe("githubBranchesList", () => {
    it("returns formatted list of branches", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { name: "main", protected: true, commit: { sha: "1111111890" } },
            { name: "feature/abc", protected: false, commit: { sha: "2222222890" } },
          ]),
      } as Response);

      const res = await githubBranchesList("test-token", { owner: "user", repo: "my-repo" });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.branches).toHaveLength(2);
        expect(res.output).toContain("main [protegida]");
        expect(res.output).toContain("feature/abc");
      }
    });
  });

  describe("githubBranchesCreate", () => {
    it("rejects invalid branch names with clear PT-BR error", async () => {
      const res = await githubBranchesCreate("test-token", {
        owner: "user",
        repo: "my-repo",
        branch: "bad..branch",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Nome de branch inválido");
      }
    });

    it("returns error if branch already exists", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ name: "existing-branch" }),
      } as Response);

      const res = await githubBranchesCreate("test-token", {
        owner: "user",
        repo: "my-repo",
        branch: "existing-branch",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("A branch 'existing-branch' já existe no repositório.");
      }
    });

    it("creates a new branch successfully from default branch", async () => {
      global.fetch = vi
        .fn()
        // 1. check existence -> 404 (not exists)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ message: "Not Found" }),
        } as Response)
        // 2. get repo metadata (default_branch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ default_branch: "main" }),
        } as Response)
        // 3. get default branch ref SHA
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ object: { sha: "abc123456789" } }),
        } as Response)
        // 4. create ref
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ ref: "refs/heads/feature/new-feat" }),
        } as Response);

      const res = await githubBranchesCreate("test-token", {
        owner: "user",
        repo: "my-repo",
        branch: "feature/new-feat",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.branch).toBe("feature/new-feat");
        expect(res.sha).toBe("abc123456789");
        expect(res.output).toContain("Branch 'feature/new-feat' criada com sucesso");
      }
    });
  });
});
