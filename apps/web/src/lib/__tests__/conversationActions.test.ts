import { describe, it, expect } from "vitest";

describe("Conversation Actions", () => {
  it("validates conversation title on rename", () => {
    function validateTitle(title: string): { valid: boolean; error?: string } {
      const trimmed = title.trim();
      if (!trimmed) {
        return { valid: false, error: "Título não pode ser vazio" };
      }
      if (trimmed.length > 200) {
        return { valid: false, error: "Título excede 200 caracteres" };
      }
      return { valid: true };
    }

    expect(validateTitle("").valid).toBe(false);
    expect(validateTitle("   ").valid).toBe(false);
    expect(validateTitle("Minha Nova Conversa").valid).toBe(true);
    expect(validateTitle("a".repeat(201)).valid).toBe(false);
  });

  it("toggles pinning status correctly", () => {
    type Mission = { id: string; isPinned: boolean };
    function togglePin(mission: Mission): Mission {
      return { ...mission, isPinned: !mission.isPinned };
    }

    const item: Mission = { id: "m1", isPinned: false };
    const pinned = togglePin(item);
    expect(pinned.isPinned).toBe(true);

    const unpinned = togglePin(pinned);
    expect(unpinned.isPinned).toBe(false);
  });

  it("handles share token generation and revocation", () => {
    type MissionShareState = { shareToken: string | null };

    function setSharing(state: MissionShareState, enable: boolean, generatedToken?: string): MissionShareState {
      if (!enable) {
        return { shareToken: null };
      }
      return { shareToken: state.shareToken || generatedToken || "mock-token-123" };
    }

    const initial: MissionShareState = { shareToken: null };
    const shared = setSharing(initial, true, "uuid-abc-123");
    expect(shared.shareToken).toBe("uuid-abc-123");

    const reEnabled = setSharing(shared, true, "uuid-xyz-456");
    expect(reEnabled.shareToken).toBe("uuid-abc-123"); // Reuses existing token

    const disabled = setSharing(shared, false);
    expect(disabled.shareToken).toBeNull();
  });

  it("sorts pinned items before unpinned items", () => {
    const items = [
      { id: "1", title: "C1", isPinned: false, createdAt: "2026-01-02" },
      { id: "2", title: "C2", isPinned: true, createdAt: "2026-01-01" },
      { id: "3", title: "C3", isPinned: false, createdAt: "2026-01-03" },
    ];

    const sorted = [...items].sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    expect(sorted[0].id).toBe("2"); // Pinned
    expect(sorted[1].id).toBe("3"); // Unpinned, newer
    expect(sorted[2].id).toBe("1"); // Unpinned, older
  });
});
