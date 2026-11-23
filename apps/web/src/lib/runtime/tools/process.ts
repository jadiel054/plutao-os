/**
 * Software Factory FASE 2 — tool `process`: execução real de comandos.
 *
 * Executa binários allowlisted via `spawn` SEM shell, confinado ao workspace
 * da sandbox do usuário/execution (`sandboxNamespace` + `resolveSandboxPath`).
 *
 * Fail-closed:
 *  - Desabilitada por padrão: exige `SOFTWARE_FACTORY_PROCESS_ENABLED=1`.
 *    Em serverless (Vercel) o runtime não dispõe de process durável — a tool
 *    permanece recusada até que o ambiente declare capacidade explícita.
 *  - Binário fora da allowlist, argumento com metacaractere de shell, cwd
 *    fora da sandbox ou tempo/área de saída acima do teto são recusados.
 *  - Ambiente do processo filho é limpo (nada de secrets do servidor):
 *    apenas PATH, HOME (apontado para o workspace) e variáveis de proxy
 *    explícitas (HTTP(S)_PROXY) — nunca herda `process.env` inteiro.
 *
 * Limitação documentada (não vendida como isolamento absoluto): o confinamento
 * aqui é de workspace + allowlist + env limpo. Execute em ambiente dedicado
 * (container/VM) para isolamento em nível de SO. Veja docs/SOFTWARE_FACTORY.md.
 */

import { spawn } from "node:child_process";
import {
  getStorageBackend,
  LocalFilesystemStorage,
} from "./storage";
import { resolveSandboxPath } from "./sandbox";
import { sandboxNamespace } from "./namespace";
import type { ToolResult } from "./types";

const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

/** Binários permitidos para a Software Factory. Shell nunca é invocado. */
const COMMAND_ALLOWLIST = new Set([
  "node",
  "npm",
  "npx",
  "git",
  "ls",
  "cat",
  "echo",
  "mkdir",
  "touch",
  "mv",
  "cp",
]);

/** Binários explicitamente recusados mesmo por engano de registro futuro. */
const COMMAND_DENYLIST = new Set([
  "rm",
  "rmdir",
  "chmod",
  "chown",
  "sh",
  "bash",
  "zsh",
  "fish",
  "curl",
  "wget",
  "ssh",
  "sudo",
  "kill",
  "pkill",
]);

/** Metacaracteres que indicariam shell injection se um shell escapassem.
 * `|` é a gap clássica de pipe; `(`/`)`/newline são seguros com shell:false
 * (args literais, ex.: `node -e` usa parênteses) e não são recusados. */
const SHELL_METACHAR = /[;&|`$\\]/;

export function isProcessToolEnabled(): boolean {
  return process.env.SOFTWARE_FACTORY_PROCESS_ENABLED === "1";
}

export type ProcessToolInput = {
  cmd: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
};

export function parseProcessInput(input: string): { ok: true; value: ProcessToolInput } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(input ?? ""));
  } catch {
    return { ok: false, error: "input inválido: esperado JSON {cmd, args?, cwd?, timeoutMs?}" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "input inválido: esperado objeto JSON" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.cmd !== "string" || !obj.cmd.trim()) {
    return { ok: false, error: "campo 'cmd' (string) é obrigatório" };
  }
  if (obj.args !== undefined && (!Array.isArray(obj.args) || !obj.args.every((a) => typeof a === "string" || typeof a === "number"))) {
    return { ok: false, error: "'args' deve ser um array de strings/números" };
  }
  if (obj.cwd !== undefined && typeof obj.cwd !== "string") {
    return { ok: false, error: "'cwd' deve ser string relativa à sandbox" };
  }
  if (obj.timeoutMs !== undefined && (typeof obj.timeoutMs !== "number" || !Number.isFinite(obj.timeoutMs))) {
    return { ok: false, error: "'timeoutMs' deve ser número" };
  }
  return {
    ok: true,
    value: {
      cmd: obj.cmd,
      args: (obj.args ?? []).map(String),
      cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
      timeoutMs: typeof obj.timeoutMs === "number" ? obj.timeoutMs : undefined,
    },
  };
}

/**
 * Ambiente mínimo e limpo para o processo filho. HOME aponta para o workspace;
 * nenhuma variável do servidor (secrets) é propagada — nem mesmo por engano.
 * `extraEnv` é reservado para injeção auditada pelo chamador (nunca usa direto
 * do `process.env`).
 */
export function buildChildEnv(workspaceDir: string, extraEnv: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: workspaceDir,
    LANG: "C.UTF-8",
    ...extraEnv,
  };
}

function truncate(buf: Buffer, maxBytes: number): { text: string; truncated: boolean } {
  const truncated = buf.length > maxBytes;
  return { text: buf.subarray(0, maxBytes).toString("utf-8"), truncated };
}

export type ProcessRunResult =
  | (ToolResult & { ok: true; exitCode: number | null; timedOut: boolean; truncated: boolean })
  | (ToolResult & {
      ok: false;
      error: string;
      exitCode?: number | null;
      timedOut?: boolean;
    });

export async function runProcess(
  input: string,
  executionId: string | undefined,
  userId: string
): Promise<ProcessRunResult> {
  const started = Date.now();

  if (!isProcessToolEnabled()) {
    return {
      ok: false,
      tool: "process",
      input,
      error:
        "process está desabilitado neste ambiente (SOFTWARE_FACTORY_PROCESS_ENABLED=1 é obrigatório). Fail-closed: nenhum comando foi executado.",
      durationMs: Date.now() - started,
    };
  }

  const parsed = parseProcessInput(input);
  if (!parsed.ok) {
    return { ok: false, tool: "process", input, error: parsed.error, durationMs: Date.now() - started };
  }

  const { cmd, args = [], cwd, timeoutMs } = parsed.value;

  if (COMMAND_DENYLIST.has(cmd)) {
    return { ok: false, tool: "process", input, error: `comando recusado: '${cmd}' está na denylist`, durationMs: Date.now() - started };
  }
  if (!COMMAND_ALLOWLIST.has(cmd)) {
    return {
      ok: false,
      tool: "process",
      input,
      error: `comando recusado: '${cmd}' não está na allowlist (${[...COMMAND_ALLOWLIST].sort().join(", ")})`,
      durationMs: Date.now() - started,
    };
  }
  if (args.some((arg) => SHELL_METACHAR.test(arg))) {
    return {
      ok: false,
      tool: "process",
      input,
      error: "argumento recusado: metacaractere de shell detectado (execução sem shell)",
      durationMs: Date.now() - started,
    };
  }

  let namespace: string;
  try {
    namespace = sandboxNamespace(userId, executionId ?? null);
  } catch (error) {
    return {
      ok: false,
      tool: "process",
      input,
      error: `sandbox inválida: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - started,
    };
  }

  // Workspace real = MESMO diretório da tool `filesystem` (backend local).
  // Em memória (serverless) não existe diretório: fail-closed.
  const backend = getStorageBackend();
  if (!(backend instanceof LocalFilesystemStorage)) {
    return {
      ok: false,
      tool: "process",
      input,
      error:
        "process exige backend de storage local com diretório real (FILESYSTEM_STORAGE_TYPE=local); no serverless em memória nenhum comando é executado.",
      durationMs: Date.now() - started,
    };
  }
  const workspaceDir = await backend.workspaceRoot(namespace).catch(() => {
    return null;
  });
  if (!workspaceDir) {
    return {
      ok: false,
      tool: "process",
      input,
      error: "não foi possível garantir o workspace da sandbox para esta execution",
      durationMs: Date.now() - started,
    };
  }

  let cwdDir = workspaceDir;
  if (cwd) {
    try {
      cwdDir = await resolveSandboxPath(cwd, workspaceDir);
    } catch (error) {
      return {
        ok: false,
        tool: "process",
        input,
        error: `cwd recusado: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - started,
      };
    }
  }

  const effectiveTimeout = Math.min(Math.max(1000, timeoutMs ?? DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS);
  const stdoutBuf: Buffer[] = [];
  const stderrBuf: Buffer[] = [];

  try {
    const result = await new Promise<{ code: number | null; timedOut: boolean; signal: NodeJS.Signals | null }>(
      (resolvePromise, rejectPromise) => {
        const child = spawn(cmd, args, {
          cwd: cwdDir,
          env: buildChildEnv(cwdDir) as unknown as NodeJS.ProcessEnv,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"] as const,
        });

        let settleGuard = 0;
        const settle = (
          outcome: { code: number | null; timedOut: boolean; signal: NodeJS.Signals | null }
        ) => {
          settleGuard = 1;
          resolvePromise(outcome);
        };

        child.stdout?.on("data", (chunk: Buffer) => {
          if (stdoutBuf.reduce((n, b) => n + b.length, 0) < MAX_OUTPUT_BYTES * 2) stdoutBuf.push(chunk);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          if (stderrBuf.reduce((n, b) => n + b.length, 0) < MAX_OUTPUT_BYTES * 2) stderrBuf.push(chunk);
        });

        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try {
            // Mata o grupo inteiro (POSIX) para não deixar netos órfãos.
            if (child.pid) process.kill(-child.pid, "SIGTERM");
          } catch {
            child.kill("SIGTERM");
          }
          setTimeout(() => {
            try {
              if (child.pid) process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }, 2000).unref();
        }, effectiveTimeout);
        timer.unref();

        child.on("error", (err) => {
          clearTimeout(timer);
          if (!settleGuard) rejectPromise(err);
        });
        child.on("close", (code, signal) => {
          clearTimeout(timer);
          if (!settleGuard) settle({ code, timedOut, signal });
        });
      }
    );

    const stdout = truncate(Buffer.concat(stdoutBuf), MAX_OUTPUT_BYTES);
    const stderr = truncate(Buffer.concat(stderrBuf), MAX_OUTPUT_BYTES);
    const ok = result.code === 0 && !result.timedOut;
    const durationMs = Date.now() - started;
    const exitInfo = `exit=${result.code ?? (result.timedOut ? "TIMEOUT" : "null")}`;
    const outputParts = [
      stdout.text && `stdout:\n${stdout.text}`,
      stderr.text && `stderr:\n${stderr.text}`,
      exitInfo,
    ].filter(Boolean) as string[];

    if (!ok) {
      const detail = [stderr.text.trim(), stdout.text.trim()]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 500);
      return {
        ok: false,
        tool: "process",
        input,
        error: `processo terminou com falha (${exitInfo}${detail ? `: ${detail}` : ""})`,
        durationMs,
        exitCode: result.code,
        timedOut: result.timedOut,
      };
    }

    return {
      ok: true,
      tool: "process",
      input,
      output: outputParts.join("\n") || "(sem saída)",
      durationMs,
      exitCode: result.code,
      timedOut: result.timedOut,
      truncated: stdout.truncated || stderr.truncated,
    };
  } catch (error) {
    return {
      ok: false,
      tool: "process",
      input,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }
}
