import { describe, expect, it } from "vitest";
import { groupConsecutiveByProvider } from "../toolGroups";
import type { ToolCallItem } from "@/components/chat/ActionCards";

function call(id: string, provider: string, status: ToolCallItem["status"] = "ok"): ToolCallItem {
  return { id, provider, capability: id, status };
}

describe("groupConsecutiveByProvider", () => {
  it("agrupa chamadas consecutivas do mesmo provedor preservando ordem", () => {
    const groups = groupConsecutiveByProvider([
      call("1", "github"), call("2", "github"), call("3", "github"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].provider).toBe("github");
    expect(groups[0].calls.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("nao reabre o bloco anterior quando outro provedor intercala", () => {
    const groups = groupConsecutiveByProvider([
      call("1", "github"), call("2", "neon"), call("3", "github"),
    ]);
    expect(groups.map((g) => g.provider)).toEqual(["github", "neon", "github"]);
    expect(groups[2].calls.map((c) => c.id)).toEqual(["3"]);
  });

  it("mantem blocos separados no padrao github, neon x2, vercel, github", () => {
    const groups = groupConsecutiveByProvider([
      call("1", "github"),
      call("2", "neon"), call("3", "neon"),
      call("4", "vercel"),
      call("5", "github"),
    ]);
    expect(groups.map((g) => [g.provider, g.calls.length])).toEqual([
      ["github", 1],
      ["neon", 2],
      ["vercel", 1],
      ["github", 1],
    ]);
  });

  it("retorna lista vazia para entrada vazia ou indefinida", () => {
    expect(groupConsecutiveByProvider([])).toEqual([]);
    expect(groupConsecutiveByProvider(undefined)).toEqual([]);
    expect(groupConsecutiveByProvider(null)).toEqual([]);
  });

  it("nao agrupa provedores diferentes mesmo adjacente por nome parcial", () => {
    const groups = groupConsecutiveByProvider([
      call("1", "github"), call("2", "github_actions"),
    ]);
    // "github_actions" e um provedor estrutural distinto: nao agrupa.
    expect(groups.map((g) => g.provider)).toEqual(["github", "github_actions"]);
  });
});
