import { describe, expect, it } from "vitest";
import {
  diffInventories,
  discoverSystemCapabilities,
  planStudy,
  type CapabilityInventory,
} from "../capability-discovery";

const now = "2026-11-26T12:00:00Z";

describe("discoverSystemCapabilities", () => {
  it("inclui registro estático + fontes aprendidas", () => {
    const inv = discoverSystemCapabilities({
      now,
      learned: [{ id: "tool-learning:ci-api", source: "learned", kind: "api", description: "CI API", discoveredAt: now }],
      surfaces: [{ pageId: "chat", route: "/chat", purpose: "conversa" }],
      runtimeFlags: [{ id: "mode.local", source: "runtime_flag", kind: "mode", description: "modo local", discoveredAt: now }],
    });
    expect(inv.capabilities.some((c) => c.source === "registry")).toBe(true);
    expect(inv.capabilities.some((c) => c.id === "tool-learning:ci-api")).toBe(true);
    expect(inv.surfaces).toHaveLength(1);
  });
});

describe("diffInventories + planStudy", () => {
  const prev: CapabilityInventory = {
    generatedAt: now,
    surfaces: [],
    capabilities: [
      { id: "a.x", source: "registry", kind: "api", description: "antigo", discoveredAt: now },
      { id: "b.y", source: "registry", kind: "api", description: "estável", discoveredAt: now },
    ],
  };
  const cur: CapabilityInventory = {
    generatedAt: now,
    surfaces: [],
    capabilities: [
      { id: "a.x", source: "registry", kind: "api", description: "novo contrato", discoveredAt: now },
      { id: "b.y", source: "registry", kind: "api", description: "estável", discoveredAt: now },
      { id: "c.z", source: "learned", kind: "api", description: "aprendida", discoveredAt: now },
    ],
  };
  it("detecta adicionadas, alteradas e removidas", () => {
    const d = diffInventories(prev, cur);
    expect(d.added.map((c) => c.id)).toEqual(["c.z"]);
    expect(d.changed.map((c) => c.id)).toEqual(["a.x"]);
    expect(d.removed).toHaveLength(0);
  });
  it("plano de estudo cobre doc + probe + registro, sem probe se política negar", () => {
    const d = diffInventories(prev, cur);
    const withProbe = planStudy(d, { allowAuthorizedProbe: true });
    expect(withProbe.needsStudy).toBe(true);
    expect(withProbe.steps.some((s) => s.kind === "authorized_probe")).toBe(true);
    const noProbe = planStudy(d, { allowAuthorizedProbe: false });
    expect(noProbe.steps.some((s) => s.kind === "authorized_probe")).toBe(false);
    expect(noProbe.steps.some((s) => s.kind === "record_knowledge")).toBe(true);
  });
});
