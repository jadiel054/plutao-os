import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess, isProcessToolEnabled, parseProcessInput, buildChildEnv } from "../process";
import {
  getStorageBackend,
  LocalFilesystemStorage,
  setStorageBackend,
  resetStorage,
} from "../storage";

const NODE_AVAILABLE = process.version.startsWith("v");

let baseDir: string;

describe("Software Factory — tool process", () => {
  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), "plutao-process-test-"));
  });

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
    resetStorage();
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
    resetStorage();
    setStorageBackend(new LocalFilesystemStorage(baseDir, "exec"));
  });

  describe("gating fail-closed", () => {
    it("é desabilitada por padrão e não executa nada", async () => {
      delete process.env.SOFTWARE_FACTORY_PROCESS_ENABLED;
      expect(isProcessToolEnabled()).toBe(false);
      const result = await runProcess('{"cmd":"node","args":["--version"]}', "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("SOFTWARE_FACTORY_PROCESS_ENABLED");
      }
    });
  });

  describe("validação de comando", () => {
    it("recusa binário fora da allowlist", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const result = await runProcess('{"cmd":"python3"}', "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("não está na allowlist");
    });

    it("recusa binários de shell/destrutivos explicitamente", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      for (const cmd of ["rm", "bash", "sh", "sudo", "curl"]) {
        const result = await runProcess(JSON.stringify({ cmd }), "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
        expect(result.ok).toBe(false);
      }
    });

    it("recusa metacaractere de shell em argumentos", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const result = await runProcess(
        JSON.stringify({ cmd: "git", args: ["commit; rm -rf /"] }),
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("metacaractere");
    });

    it("parseProcessInput reprojeita entradas inválidas com erro claro", () => {
      expect(parseProcessInput("não é json").ok).toBe(false);
      expect(parseProcessInput("{}").ok).toBe(false);
      expect(parseProcessInput('{"cmd":"git"}').ok).toBe(true);
      expect(parseProcessInput('{"cmd":"git","args":["init"],"cwd":"src"}').ok).toBe(true);
      expect(parseProcessInput('{"cmd":"git","args":"init"}').ok).toBe(false);
    });

    it("buildChildEnv não propaga secrets do servidor", () => {
      const env = buildChildEnv("/workspace");
      expect(env.HOME).toBe("/workspace");
      expect(env.MODEL_API_KEY).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.SESSION_SECRET).toBeUndefined();
      expect(env.PATH).toBeTruthy();
    });
  });

  describe("execução real confinada ao workspace", () => {
    const USER_ID = "33333333-3333-4333-8333-333333333333";
    const EXEC_ID = "44444444-4444-4444-8444-444444444444";

    it.skipIf(!NODE_AVAILABLE)("executa binário allowlisted e devolve exit 0", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const result = await runProcess(
        JSON.stringify({ cmd: "node", args: ["--version"] }),
        EXEC_ID,
        USER_ID
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.output).toContain("exit=0");
        expect(result.output).toContain(process.version.slice(0, 3));
      }
    });

    it.skipIf(!NODE_AVAILABLE)("vê os mesmos arquivos escritos pela tool filesystem", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const backend = getStorageBackend() as LocalFilesystemStorage;
      await backend.writeFile(`${USER_ID}__${EXEC_ID}`, "hello.txt", "conteudo-plutao");
      const result = await runProcess(
        JSON.stringify({ cmd: "cat", args: ["hello.txt"] }),
        EXEC_ID,
        USER_ID
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.output).toContain("conteudo-plutao");
        expect(result.output).toContain("exit=0");
      }
    });

    it.skipIf(!NODE_AVAILABLE)("cwd relativa deve permanecer dentro do workspace", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const backend = getStorageBackend() as LocalFilesystemStorage;
      await backend.createDirectory(`${USER_ID}__${EXEC_ID}`, "sub");
      const inside = await runProcess(
        JSON.stringify({ cmd: "node", args: ["--version"], cwd: "sub" }),
        EXEC_ID,
        USER_ID
      );
      expect(inside.ok).toBe(true);

      const escape = await runProcess(
        JSON.stringify({ cmd: "node", args: ["--version"], cwd: "../../etc" }),
        EXEC_ID,
        USER_ID
      );
      expect(escape.ok).toBe(false);
      if (!escape.ok) expect(escape.error).toContain("cwd recusado");
    });

    it.skipIf(!NODE_AVAILABLE)("timeout mata o processo e devolve ok=false com timedOut", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const result = await runProcess(
        JSON.stringify({ cmd: "node", args: ["-e", "setTimeout(function(){}, 30000)"], timeoutMs: 1500 }),
        EXEC_ID,
        USER_ID
      );
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
    }, 20_000);

    it.skipIf(!NODE_AVAILABLE)("saída acima do teto é truncada", async () => {
      vi.stubEnv("SOFTWARE_FACTORY_PROCESS_ENABLED", "1");
      const result = await runProcess(
        JSON.stringify({
          cmd: "node",
          args: ["-e", "console.log(Buffer.alloc(200000, 'x').toString())"],
          timeoutMs: 15000,
        }),
        EXEC_ID,
        USER_ID
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.truncated).toBe(true);
        expect(result.output.length).toBeLessThan(300000);
      }
    }, 20_000);
  });
});
