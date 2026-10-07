/**
 * H8 — Sandbox/storage.
 *
 * Cobre: symlink real escapando da raiz, IDs malformados antes de montar caminho,
 * ausência do namespace `default` compartilhado e raiz inexistente.
 */

import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SandboxSecurityError,
  assertSandboxExecutionId,
  assertSandboxUserId,
  getUserSandboxRoot,
  resolveSandboxPath,
} from "../sandbox";
import { sandboxNamespace } from "../namespace";
import { LocalFilesystemStorage } from "../storage";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const EXEC = "44444444-4444-4444-8444-444444444444";

let base = "";
let root = "";
let outside = "";

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "plutao-sandbox-"));
  root = join(base, "sandbox");
  outside = join(base, "fora-da-sandbox");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "segredo.txt"), "conteudo secreto", "utf-8");
  // symlink real apontando para FORA da raiz
  await symlink(outside, join(root, "escape"), "dir");
  // symlink real apontando para dentro (deve ser permitido)
  await mkdir(join(root, "interno"), { recursive: true });
  await symlink(join(root, "interno"), join(root, "atalho"), "dir");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("H8 — validação de IDs antes de montar caminho", () => {
  it("userId precisa ser UUID", () => {
    expect(assertSandboxUserId(USER)).toBe(USER);
    for (const bad of ["", "user-1", "../../etc", "a/b", "..", "null"]) {
      expect(() => assertSandboxUserId(bad)).toThrow(SandboxSecurityError);
    }
  });

  it("executionId precisa ser UUID ou rótulo interno seguro", () => {
    expect(assertSandboxExecutionId(EXEC)).toBe(EXEC);
    expect(assertSandboxExecutionId("chat")).toBe("chat");
    for (const bad of ["", "../../etc", "a/b", "..", "exec 1", "x".repeat(65)]) {
      expect(() => assertSandboxExecutionId(bad)).toThrow(SandboxSecurityError);
    }
  });

  it("getUserSandboxRoot recusa userId/missionId malformados", () => {
    expect(() => getUserSandboxRoot("../../etc")).toThrow(SandboxSecurityError);
    expect(() => getUserSandboxRoot(USER, "../../etc")).toThrow(SandboxSecurityError);
  });

  it("namespace nunca é `default` para operação autenticada", () => {
    expect(sandboxNamespace(USER, EXEC)).toBe(`${USER}__${EXEC}`);
    expect(() => sandboxNamespace(USER)).toThrow(SandboxSecurityError);
    expect(() => sandboxNamespace(OTHER_USER)).toThrow(SandboxSecurityError);
  });

  it("namespace rejeita IDs malformados em vez de 'limpar'", () => {
    expect(() => sandboxNamespace("../../etc", EXEC)).toThrow(SandboxSecurityError);
    expect(() => sandboxNamespace(USER, "../../etc")).toThrow(SandboxSecurityError);
  });

  it("sem usuário autenticado é recusado antes de montar um namespace", () => {
    expect(() => sandboxNamespace(undefined, undefined)).toThrow(SandboxSecurityError);
  });
});

describe("H8 — escape por symlink", () => {
  it("bloqueia symlink que aponta para fora da raiz (arquivo existente)", async () => {
    await expect(resolveSandboxPath("escape/segredo.txt", root)).rejects.toThrow(
      SandboxSecurityError
    );
  });

  it("bloqueia symlink para fora mesmo quando o alvo AINDA NÃO existe", async () => {
    await expect(resolveSandboxPath("escape/nao-existe.txt", root)).rejects.toThrow(
      SandboxSecurityError
    );
  });

  it("bloqueia escrita através de symlink para fora", async () => {
    await expect(resolveSandboxPath("escape/novo.txt", root)).rejects.toThrow(
      SandboxSecurityError
    );
  });

  it("permite symlink que aponta para dentro da raiz", async () => {
    const resolved = await resolveSandboxPath("atalho/arquivo.txt", root);
    expect(resolved.startsWith(root)).toBe(true);
  });

  it("bloqueia path traversal clássico", async () => {
    for (const bad of ["../fora-da-sandbox/segredo.txt", "..", "a/../../b", "/etc/passwd"]) {
      await expect(resolveSandboxPath(bad, root)).rejects.toThrow(SandboxSecurityError);
    }
  });

  it("raiz inexistente não quebra a resolução (raiz é criada sob demanda)", async () => {
    const novaIa = join(base, "raiz-inexistente");
    const resolved = await resolveSandboxPath("ok.txt", novaIa);
    expect(resolved.startsWith(novaIa)).toBe(true);
  });

  it("backend local bloqueia escrita através de symlink para fora", async () => {
    const storageRoot = join(base, "local-storage");
    const storage = new LocalFilesystemStorage(storageRoot, "exec");
    const namespace = `${USER}__${EXEC}`;
    await storage.writeFile(namespace, "seguro.txt", "ok");
    const executionRoot = join(storageRoot, "exec", namespace);
    await symlink(outside, join(executionRoot, "escape-local"), "dir");

    await expect(storage.writeFile(namespace, "escape-local/novo.txt", "não"))
      .rejects.toThrow(SandboxSecurityError);
  });
});
