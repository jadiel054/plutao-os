import { describe, it, expect, vi, beforeEach } from "vitest";
import { githubWriteFilesWithToken, githubWriteFiles } from "../githubFiles";
import * as connectorsService from "../service";

vi.mock("../service");

describe("GitHub Files Write Client (github.files.write)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject when files array is empty", async () => {
    const res = await githubWriteFilesWithToken("mock-token", {
      owner: "octocat",
      repo: "hello-world",
      files: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("files[] vazio");
    }
  });

  it("should enforce maximum of 20 files limit", async () => {
    const files = Array.from({ length: 21 }, (_, i) => ({
      path: `file${i}.txt`,
      content: "hello",
    }));

    const res = await githubWriteFilesWithToken("mock-token", {
      owner: "octocat",
      repo: "hello-world",
      files,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("máximo 20 arquivos");
    }
  });

  it("should enforce maximum of 100KB per file limit", async () => {
    const largeContent = "a".repeat(100 * 1024 + 1);
    const res = await githubWriteFilesWithToken("mock-token", {
      owner: "octocat",
      repo: "hello-world",
      files: [{ path: "big.txt", content: largeContent }],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("excede o limite de 100KB");
    }
  });

  it("should reject path traversal attempts containing '..'", async () => {
    const res = await githubWriteFilesWithToken("mock-token", {
      owner: "octocat",
      repo: "hello-world",
      files: [{ path: "../etc/passwd", content: "forbidden" }],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("path traversal detectado");
    }
  });

  it("should perform atomic commit via Git Data API and verify read-back content", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method || "GET";

      if (url.includes("/git/ref/heads/main")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ object: { sha: "base-ref-sha" } }),
        });
      }
      if (url.includes("/git/commits/base-ref-sha")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ tree: { sha: "base-tree-sha" } }),
        });
      }
      if (url.includes("/git/blobs")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "blob-sha-123" }),
        });
      }
      if (url.includes("/git/trees")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "new-tree-sha" }),
        });
      }
      if (url.includes("/git/commits") && method === "POST") {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              sha: "new-commit-sha",
              html_url: "https://github.com/octocat/hello-world/commit/new-commit-sha",
            }),
        });
      }
      if (url.includes("/git/refs/heads/main") && method === "PATCH") {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ object: { sha: "new-commit-sha" } }),
        });
      }
      if (url.includes("/contents/index.html")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              content: Buffer.from("<h1>Hello World</h1>").toString("base64"),
              encoding: "base64",
            }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: "Not found" }),
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    const res = await githubWriteFilesWithToken("mock-token", {
      owner: "octocat",
      repo: "hello-world",
      files: [{ path: "index.html", content: "<h1>Hello World</h1>" }],
      message: "feat: add index.html",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.commitSha).toBe("new-commit-sha");
      expect(res.output).toContain("push ok: octocat/hello-world@main");
      expect(res.output).toContain("verificação pós-escrita: 100% verificado sem divergências");
    }
  });

  it("should report error when post-write read-back content diverges from expected", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method || "GET";

      if (url.includes("/git/ref/heads/main")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ object: { sha: "base-ref-sha" } }),
        });
      }
      if (url.includes("/git/commits/base-ref-sha")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ tree: { sha: "base-tree-sha" } }),
        });
      }
      if (url.includes("/git/blobs")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "blob-sha-123" }),
        });
      }
      if (url.includes("/git/trees")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "new-tree-sha" }),
        });
      }
      if (url.includes("/git/commits") && method === "POST") {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              sha: "new-commit-sha",
              html_url: "https://github.com/octocat/hello-world/commit/new-commit-sha",
            }),
        });
      }
      if (url.includes("/git/refs/heads/main") && method === "PATCH") {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ object: { sha: "new-commit-sha" } }),
        });
      }
      if (url.includes("/contents/index.html")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              content: Buffer.from("<h1>Divergent Content</h1>").toString("base64"),
              encoding: "base64",
            }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: "Not found" }),
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    const res = await githubWriteFilesWithToken("mock-token", {
      owner: "octocat",
      repo: "hello-world",
      files: [{ path: "index.html", content: "<h1>Expected Content</h1>" }],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Divergência detectada após escrita no arquivo 'index.html'");
    }
  });

  it("githubWriteFiles should obtain token from service and call writer", async () => {
    vi.spyOn(connectorsService, "getAccessToken").mockResolvedValue("user-oauth-token");

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/git/ref/heads/main")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ object: { sha: "base-ref-sha" } }),
        });
      }
      if (url.includes("/git/commits/base-ref-sha")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ tree: { sha: "base-tree-sha" } }),
        });
      }
      if (url.includes("/git/blobs")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "blob-sha" }),
        });
      }
      if (url.includes("/git/trees")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "tree-sha" }),
        });
      }
      if (url.includes("/git/commits")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ sha: "commit-sha" }),
        });
      }
      if (url.includes("/git/refs/heads/main")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ object: { sha: "commit-sha" } }),
        });
      }
      if (url.includes("/contents/README.md")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              content: Buffer.from("Hello").toString("base64"),
              encoding: "base64",
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => "{}" });
    });

    vi.stubGlobal("fetch", mockFetch);

    const res = await githubWriteFiles("user-1", {
      owner: "octocat",
      repo: "hello-world",
      files: [{ path: "README.md", content: "Hello" }],
    });

    expect(connectorsService.getAccessToken).toHaveBeenCalledWith("user-1", "github");
    expect(res.ok).toBe(true);
  });
});
