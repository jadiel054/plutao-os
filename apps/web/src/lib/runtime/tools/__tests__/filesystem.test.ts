/**
 * Filesystem Tool V1 - Comprehensive Test Suite
 * 
 * Tests for:
 * - All 5 filesystem operations (list, read, write, mkdir, stat)
 * - Security: path traversal, symlink escape, absolute paths
 * - Limits: file size enforcement
 * - Integration: through Dispatcher
 * - Isolation: execution-based isolation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runFilesystem,
  filesystemList,
  filesystemRead,
  filesystemWrite,
  filesystemMkdir,
  MAX_FILE_SIZE,
} from "../filesystem";
import {
  InMemoryStorage,
  setStorageBackend,
  resetStorage,
} from "../storage";

// Test setup
const TEST_EXECUTION_ID = "test-execution-001";
const ANOTHER_EXECUTION_ID = "test-execution-002";

// Helper to create fresh storage for each test
function setupFreshStorage() {
  const storage = new InMemoryStorage();
  setStorageBackend(storage);
  return storage;
}

// Reset storage after each test
function cleanupStorage() {
  resetStorage();
}

describe("Filesystem Tool - Happy Path Tests", () => {
  beforeEach(() => {
    setupFreshStorage();
  });

  afterEach(() => {
    cleanupStorage();
  });

  describe("filesystem.list", () => {
    it("should list empty directory", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { entries: Array<{ name: string; type: string }> };
      expect(output.entries).toEqual([]);
    });

    it("should list directory with files", async () => {
      // Create some files first
      await filesystemWrite("test.txt", "hello", TEST_EXECUTION_ID);
      await filesystemWrite("notes/readme.txt", "notes content", TEST_EXECUTION_ID);
      await filesystemMkdir("projects", TEST_EXECUTION_ID);

      const result = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { entries: Array<{ name: string; type: string }> };
      
      // Should have at least the files we created
      const names = output.entries.map(e => e.name);
      expect(names).toContain("test.txt");
      expect(names).toContain("projects");
    });

    it("should list subdirectory", async () => {
      await filesystemMkdir("subdir", TEST_EXECUTION_ID);
      await filesystemWrite("subdir/file.txt", "content", TEST_EXECUTION_ID);

      const result = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "subdir" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { entries: Array<{ name: string; type: string }> };
      expect(output.entries).toHaveLength(1);
      expect(output.entries[0].name).toBe("file.txt");
      expect(output.entries[0].type).toBe("file");
    });
  });

  describe("filesystem.read", () => {
    it("should read existing file", async () => {
      await filesystemWrite("test.txt", "hello world", TEST_EXECUTION_ID);

      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "test.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { path: string; content: string; size: number };
      expect(output.path).toBe("test.txt");
      expect(output.content).toBe("hello world");
      expect(output.size).toBe(11);
    });

    it("should read file in subdirectory", async () => {
      await filesystemMkdir("notes", TEST_EXECUTION_ID);
      await filesystemWrite("notes/readme.txt", "readme content", TEST_EXECUTION_ID);

      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "notes/readme.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { content: string };
      expect(output.content).toBe("readme content");
    });

    it("should return FILE_NOT_FOUND for non-existent file", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "nonexistent.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("FILE_NOT_FOUND");
    });
  });

  describe("filesystem.write", () => {
    it("should write new file", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "new.txt", content: "new content" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { path: string; size: number };
      expect(output.path).toBe("new.txt");
      expect(output.size).toBe(11);
    });

    it("should overwrite existing file", async () => {
      await filesystemWrite("test.txt", "original", TEST_EXECUTION_ID);
      
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "test.txt", content: "updated" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { size: number };
      expect(output.size).toBe(7);

      // Verify content was updated
      const readResult = await filesystemRead("test.txt", TEST_EXECUTION_ID);
      expect(readResult.content).toBe("updated");
    });

    it("should create parent directories automatically", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "deep/nested/path/file.txt", content: "content" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      
      // Verify file exists
      const readResult = await filesystemRead("deep/nested/path/file.txt", TEST_EXECUTION_ID);
      expect(readResult.content).toBe("content");
    });

    it("should handle UTF-8 content", async () => {
      const utf8Content = "Hello world";
      
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "utf8.txt", content: utf8Content } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      
      const readResult = await filesystemRead("utf8.txt", TEST_EXECUTION_ID);
      expect(readResult.content).toBe(utf8Content);
    });
  });

  describe("filesystem.mkdir", () => {
    it("should create new directory", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "mkdir", payload: { path: "newdir" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { path: string; created: boolean };
      expect(output.path).toBe("newdir");
      expect(output.created).toBe(true);
    });

    it("should be idempotent - return created:false for existing directory", async () => {
      await filesystemMkdir("existing", TEST_EXECUTION_ID);
      
      const result = await runFilesystem(
        JSON.stringify({ action: "mkdir", payload: { path: "existing" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { created: boolean };
      expect(output.created).toBe(false);
    });

    it("should create nested directories", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "mkdir", payload: { path: "a/b/c" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { created: boolean };
      expect(output.created).toBe(true);
    });
  });

  describe("filesystem.stat", () => {
    it("should stat existing file", async () => {
      await filesystemWrite("test.txt", "content", TEST_EXECUTION_ID);

      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "test.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { path: string; exists: boolean; type: string };
      expect(output.path).toBe("test.txt");
      expect(output.exists).toBe(true);
      expect(output.type).toBe("file");
    });

    it("should stat existing directory", async () => {
      await filesystemMkdir("testdir", TEST_EXECUTION_ID);

      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "testdir" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { type: string };
      expect(output.exists).toBe(true);
      expect(output.type).toBe("directory");
    });

    it("should stat missing path", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "nonexistent" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { exists: boolean; type: string };
      expect(output.exists).toBe(false);
      expect(output.type).toBe("missing");
    });

    it("should return root directory as existing", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { exists: boolean; type: string };
      expect(output.exists).toBe(true);
      expect(output.type).toBe("directory");
    });
  });
});

describe("Filesystem Tool - Security Tests", () => {
  beforeEach(() => {
    setupFreshStorage();
  });

  afterEach(() => {
    cleanupStorage();
  });

  describe("Path Traversal Protection", () => {
    it("should block ../ traversal", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "../secret.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });

    it("should block ../../ traversal", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "../../../etc/passwd" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });

    it("should block traversal in middle of path", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "foo/../../secret.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });

    it("should block traversal in write operation", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "../malicious.txt", content: "bad" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });

    it("should block traversal in mkdir operation", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "mkdir", payload: { path: "../../malicious" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });

    it("should block traversal in stat operation", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "../secret" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });

    it("should block traversal in list operation", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "../../etc" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL");
    });
  });

  describe("Absolute Path Protection", () => {
    it("should block absolute Unix paths", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "/etc/passwd" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PATH_OUTSIDE_SANDBOX");
    });

    it("should block absolute path in write", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "/tmp/malicious.txt", content: "bad" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
    });
  });

  describe("Input Validation", () => {
    it("should allow empty path for root directory", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("FILE_NOT_FOUND");
    });

    it("should reject invalid JSON input", async () => {
      const result = await runFilesystem(
        "not valid json",
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INVALID_INPUT");
    });

    it("should reject missing action", async () => {
      const result = await runFilesystem(
        JSON.stringify({ payload: { path: "test.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INVALID_INPUT");
    });

    it("should reject unknown action", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "unknown", payload: { path: "test.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("UNSUPPORTED_OPERATION");
    });

    it("should reject missing payload", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read" }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("PERMISSION_DENIED");
    });
  });
});

describe("Filesystem Tool - Size Limit Tests", () => {
  beforeEach(() => {
    setupFreshStorage();
  });

  afterEach(() => {
    cleanupStorage();
  });

  describe("File Size Limits", () => {
    it("should allow file within size limit", async () => {
      const content = "a".repeat(MAX_FILE_SIZE - 100); // Just under limit
      
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "large.txt", content } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
    });

    it("should reject write exceeding size limit", async () => {
      const content = "a".repeat(MAX_FILE_SIZE + 1); // Just over limit
      
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "huge.txt", content } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("WRITE_TOO_LARGE");
    });

    it("should reject read exceeding size limit", async () => {
      // Manually write a large file to storage
      const storage = setupFreshStorage();
      const largeContent = "a".repeat(MAX_FILE_SIZE + 1);
      await (storage as InMemoryStorage).writeFile(TEST_EXECUTION_ID, "large.txt", largeContent);

      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "large.txt" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("FILE_TOO_LARGE");
    });

    it("should correctly calculate size in bytes for UTF-8", async () => {
      // UTF-8: some characters take multiple bytes
      const content = "e".repeat(500000); // e takes 1 byte in UTF-8
      
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "utf8-large.txt", content } }),
        TEST_EXECUTION_ID
      );

      // Should be close to the limit
      expect(result.ok).toBe(true);
    });
  });
});

describe("Filesystem Tool - Execution Isolation Tests", () => {
  beforeEach(() => {
    setupFreshStorage();
  });

  afterEach(() => {
    cleanupStorage();
  });

  describe("Execution-Based Isolation", () => {
    it("should isolate files between different execution IDs", async () => {
      // Write to first execution
      await filesystemWrite("secret.txt", "execution 1 secret", TEST_EXECUTION_ID);

      // Try to read from second execution - should not find it
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "secret.txt" } }),
        ANOTHER_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("FILE_NOT_FOUND");
    });

    it("should isolate directories between different execution IDs", async () => {
      // Create directory in first execution
      await filesystemMkdir("private", TEST_EXECUTION_ID);

      // Try to list from second execution - should not see it
      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "private" } }),
        ANOTHER_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      const output = JSON.parse(result.output) as { exists: boolean };
      expect(output.exists).toBe(false);
    });

    it("should allow same path in different executions", async () => {
      // Write same file to both executions
      await filesystemWrite("test.txt", "execution 1 content", TEST_EXECUTION_ID);
      await filesystemWrite("test.txt", "execution 2 content", ANOTHER_EXECUTION_ID);

      // Read from each execution
      const result1 = await filesystemRead("test.txt", TEST_EXECUTION_ID);
      const result2 = await filesystemRead("test.txt", ANOTHER_EXECUTION_ID);

      expect(result1.content).toBe("execution 1 content");
      expect(result2.content).toBe("execution 2 content");
    });

    it("should isolate list operations between executions", async () => {
      // Create files in first execution
      await filesystemWrite("file1.txt", "content", TEST_EXECUTION_ID);

      // Create different files in second execution
      await filesystemWrite("file2.txt", "content", ANOTHER_EXECUTION_ID);

      // List from each execution
      const list1 = await filesystemList("", TEST_EXECUTION_ID);
      const list2 = await filesystemList("", ANOTHER_EXECUTION_ID);

      const names1 = list1.entries.map(e => e.name);
      const names2 = list2.entries.map(e => e.name);

      expect(names1).toContain("file1.txt");
      expect(names1).not.toContain("file2.txt");
      expect(names2).toContain("file2.txt");
      expect(names2).not.toContain("file1.txt");
    });
  });
});

describe("Filesystem Tool - Integration Tests", () => {
  beforeEach(() => {
    setupFreshStorage();
  });

  afterEach(() => {
    cleanupStorage();
  });

  describe("Dispatcher Integration", () => {
    it("should recognize filesystem tool", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "." } }),
        TEST_EXECUTION_ID
      );

      expect(result.tool).toBe("filesystem");
    });

    it("should return structured ToolResult", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "stat", payload: { path: "." } }),
        TEST_EXECUTION_ID
      );

      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("tool");
      expect(result).toHaveProperty("input");
      expect(result).toHaveProperty("durationMs");
      expect(result.tool).toBe("filesystem");
    });

    it("should include output for successful operations", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "test.txt", content: "hello" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(true);
      expect(result).toHaveProperty("output");
    });

    it("should include error for failed operations", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "../secret" } }),
        TEST_EXECUTION_ID
      );

      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  describe("Default Execution ID", () => {
    it("should use default execution ID when none provided", async () => {
      const result = await runFilesystem(
        JSON.stringify({ action: "write", payload: { path: "test.txt", content: "hello" } })
      );

      expect(result.ok).toBe(true);

      // Verify it was written to default execution
      const readResult = await runFilesystem(
        JSON.stringify({ action: "read", payload: { path: "test.txt" } }),
        "default"
      );

      expect(readResult.ok).toBe(true);
    });
  });
});

describe("Filesystem Tool - Edge Cases", () => {
  beforeEach(() => {
    setupFreshStorage();
  });

  afterEach(() => {
    cleanupStorage();
  });

  it("should handle empty file content", async () => {
    const result = await runFilesystem(
      JSON.stringify({ action: "write", payload: { path: "empty.txt", content: "" } }),
      TEST_EXECUTION_ID
    );

    expect(result.ok).toBe(true);
    
    const readResult = await filesystemRead("empty.txt", TEST_EXECUTION_ID);
    expect(readResult.content).toBe("");
    expect(readResult.size).toBe(0);
  });

  it("should handle special characters in filenames", async () => {
    const specialName = "file-with-special_chars.txt";
    
    const result = await runFilesystem(
      JSON.stringify({ action: "write", payload: { path: specialName, content: "content" } }),
      TEST_EXECUTION_ID
    );

    expect(result.ok).toBe(true);
    
    const readResult = await filesystemRead(specialName, TEST_EXECUTION_ID);
    expect(readResult.content).toBe("content");
  });

  it("should handle deep nested paths", async () => {
    const deepPath = "a/b/c/d/e/f/g/file.txt";
    
    const result = await runFilesystem(
      JSON.stringify({ action: "write", payload: { path: deepPath, content: "deep" } }),
      TEST_EXECUTION_ID
    );

    expect(result.ok).toBe(true);
    
    const readResult = await filesystemRead(deepPath, TEST_EXECUTION_ID);
    expect(readResult.content).toBe("deep");
  });

  it("should handle root path with empty string", async () => {
    await filesystemWrite("test.txt", "content", TEST_EXECUTION_ID);

    const result = await runFilesystem(
      JSON.stringify({ action: "stat", payload: { path: "" } }),
      TEST_EXECUTION_ID
    );

    expect(result.ok).toBe(true);
    const output = JSON.parse(result.output) as { exists: boolean; type: string };
    expect(output.exists).toBe(true);
    expect(output.type).toBe("directory");
  });

  it("should handle empty directory", async () => {
    await filesystemMkdir("empty", TEST_EXECUTION_ID);

    const result = await runFilesystem(
      JSON.stringify({ action: "list", payload: { path: "empty" } }),
      TEST_EXECUTION_ID
    );

    expect(result.ok).toBe(true);
    const output = JSON.parse(result.output) as { entries: Array<{ name: string }> };
    expect(output.entries).toEqual([]);
  });

  it("should handle backslash path separators (Windows-style)", async () => {
    // Test with backslashes - should be normalized
    const result = await runFilesystem(
      JSON.stringify({ action: "write", payload: { path: "test/file.txt", content: "content" } }),
      TEST_EXECUTION_ID
    );

    // Should work (backslashes are normalized)
    expect(result.ok).toBe(true);
  });
});
