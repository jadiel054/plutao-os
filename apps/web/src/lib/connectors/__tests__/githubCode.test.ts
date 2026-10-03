import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { githubCodeSearch, githubTree } from "../githubCode";

describe("githubCode", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("githubCodeSearch", () => {
    it("searches code within repo and returns paths and snippets", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            items: [
              {
                path: "src/index.ts",
                html_url: "https://github.com/user/my-repo/blob/main/src/index.ts",
                text_matches: [{ fragment: "const app = express();\napp.listen(3000);" }],
              },
            ],
          }),
      } as Response);

      const res = await githubCodeSearch("test-token", {
        owner: "user",
        repo: "my-repo",
        query: "express",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.items).toHaveLength(1);
        expect(res.items[0].path).toBe("src/index.ts");
        expect(res.items[0].matches[0].fragment).toContain("const app = express()");
        expect(res.output).toContain("Busca de código em user/my-repo para \"express\"");
      }
    });
  });

  describe("githubTree", () => {
    it("fetches repository tree", async () => {
      global.fetch = vi
        .fn()
        // get default branch if tree_sha not provided
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ default_branch: "main" }),
        } as Response)
        // get tree
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              tree: [
                { path: "src", type: "tree", sha: "sha-tree-1" },
                { path: "src/index.ts", type: "blob", size: 1024, sha: "sha-blob-1" },
              ],
              truncated: false,
            }),
        } as Response);

      const res = await githubTree("test-token", {
        owner: "user",
        repo: "my-repo",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.tree).toHaveLength(2);
        expect(res.tree[0].path).toBe("src");
        expect(res.tree[1].size).toBe(1024);
        expect(res.output).toContain("Árvore de arquivos de user/my-repo@main");
      }
    });
  });
});
