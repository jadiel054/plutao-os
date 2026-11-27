import { describe, expect, it } from "vitest";
import {
  learnedFromExperiences,
  MAX_SNAPSHOTS_PER_USER,
  snapshotsToPrune,
  SNAPSHOT_RETENTION_DAYS,
} from "../capability-snapshot";
import type { ExperienceRecord } from "../experience-store";

const now = "2026-11-27T12:00:00Z";
const rec = (over: Partial<ExperienceRecord>): ExperienceRecord => ({
  id: "uuid-1", subject: "tool-learning:ci-api", method: "Contratos: GET /v1/runs", kind: "confirmed",
  observedAt: now, ...over,
});

describe("learnedFromExperiences", () => {
  it("mapeia apenas aprendizados (tool-learning:*)", () => {
    const caps = learnedFromExperiences([
      rec({}),
      rec({ id: "uuid-2", subject: "github", kind: "succeeded_experience" }),
      rec({ id: "uuid-3", subject: "tool-learning:outra", kind: "hypothesis" }),
    ]);
    expect(caps).toHaveLength(2);
    expect(caps[0].id).toBe("tool-learning:ci-api");
    expect(caps[0].source).toBe("learned");
    expect(caps[0].kind).toBe("tool");
  });
  it("propaga permissões e utilidade (limitado)", () => {
    const caps = learnedFromExperiences([rec({ requirements: { permissions: ["repo:read"] }, usefulFor: ["a", "b", "c", "d"] })]);
    expect(caps[0].permissions).toEqual(["repo:read"]);
    expect(caps[0].relatedTo).toHaveLength(3);
  });
});

describe("snapshotsToPrune (limites e retenção)", () => {
  const base = new Date("2026-11-27T12:00:00Z");
  const rows = (n: number, daysAgo = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: "s" + i,
      createdAt: new Date(base.getTime() - (daysAgo + (n - 1 - i)) * 24 * 60 * 60 * 1000),
    }));

  it("abaixo do limite e recentes: nada a podar", () => {
    expect(snapshotsToPrune(rows(5), base)).toEqual([]);
  });
  it("acima do limite: podapena os excedentes mais antigos", () => {
    const prune = snapshotsToPrune(rows(MAX_SNAPSHOTS_PER_USER + 3), base);
    expect(prune).toHaveLength(3);
    expect(prune).toEqual(["s0", "s1", "s2"]);
  });
  it("retenção: snapshots anteriores ao corte são podados mesmo dentro do limite", () => {
    const prune = snapshotsToPrune(rows(3, SNAPSHOT_RETENTION_DAYS + 10), base);
    expect(prune).toHaveLength(3);
  });
  it("corte de retenção preserva snapshots recentes", () => {
    const old = [{ id: "velho", createdAt: new Date(base.getTime() - (SNAPSHOT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000) }];
    const recent = [{ id: "novo", createdAt: base }];
    const prune = snapshotsToPrune(old.concat(recent), base, 10);
    expect(prune).toEqual(["velho"]);
  });
});