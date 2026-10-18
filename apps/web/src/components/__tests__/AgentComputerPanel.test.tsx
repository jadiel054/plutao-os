// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentComputerPanel, type AgentEvent } from "@/components/AgentComputerPanel";

(globalThis as unknown as { React: typeof React }).React = React;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ events: [] }),
    }))
  );
  vi.stubGlobal(
    "EventSource",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function focusEvent(events: AgentEvent[]): AgentEvent | null {
  if (events.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "observation" || e.type === "assistant_message") return e;
  }
  return events[events.length - 1] ?? null;
}

function activityLine(ev: AgentEvent): string {
  const tool = typeof ev.payload?.tool === "string" ? ev.payload.tool : null;
  if (ev.type === "action" && tool) {
    const summary =
      typeof ev.payload.inputSummary === "string"
        ? ev.payload.inputSummary
        : ev.preview;
    return `Plutão está usando ${tool} · ${summary.slice(0, 120)}`;
  }
  if (ev.type === "observation" && tool) {
    return `${ev.payload.ok !== false ? "✓" : "✕"} ${tool} · ${ev.preview.slice(0, 120)}`;
  }
  return ev.preview.slice(0, 140);
}

function base(
  partial: Partial<AgentEvent> & Pick<AgentEvent, "seq" | "type" | "preview">
): AgentEvent {
  return {
    id: `e-${partial.seq}`,
    conversationId: "c1",
    source: "test",
    payload: {},
    artifactId: null,
    visibility: "llm",
    createdAt: "2026-09-28T12:00:00.000Z",
    ...partial,
  };
}

describe("AgentComputerPanel component rendering and state behavior", () => {
  it("renders closed by default (open = false) and does not have preferOpen prop", () => {
    render(<AgentComputerPanel conversationId="c1" missionId="m1" />);

    // Painel inicia fechado por padrão: a tela e o conteúdo expansível não aparecem
    expect(screen.queryByText("Tela")).toBeNull();
    expect(screen.getByText(/Computador ·/i)).toBeDefined();
    expect(screen.getByText("Aguardando trabalho do agente")).toBeDefined();
  });

  it("toggles open state to true when header button is clicked", () => {
    render(<AgentComputerPanel conversationId="c1" missionId="m1" />);

    expect(screen.queryByText("Tela")).toBeNull();

    const headerButton = screen.getByRole("button", { name: /Computador ·/i });
    fireEvent.click(headerButton);

    // Painel expandido após o clique
    expect(screen.getByText("Tela")).toBeDefined();
    expect(screen.getByText("Atividade")).toBeDefined();

    // Clique novamente fecha o painel
    fireEvent.click(headerButton);
    expect(screen.queryByText("Tela")).toBeNull();
  });
});

describe("AgentComputerPanel feed helpers", () => {
  it("focus prefers last observation", () => {
    const events = [
      base({ seq: 1, type: "user_message", preview: "crie notes/x.txt" }),
      base({
        seq: 2,
        type: "action",
        preview: "filesystem write",
        payload: { tool: "filesystem", inputSummary: "escrevendo notes/x.txt" },
      }),
      base({
        seq: 3,
        type: "observation",
        preview: "H1_OK",
        payload: { tool: "filesystem", ok: true },
        artifactId: "art-1",
      }),
    ];
    const focus = focusEvent(events);
    expect(focus?.type).toBe("observation");
    expect(focus?.preview).toBe("H1_OK");
    expect(activityLine(events[1]!)).toContain("filesystem");
    expect(activityLine(events[1]!)).toContain("escrevendo");
  });

  it("replay cursor slices history inclusively", () => {
    const events = [
      base({ seq: 1, type: "user_message", preview: "a" }),
      base({ seq: 2, type: "assistant_message", preview: "b" }),
      base({ seq: 3, type: "assistant_message", preview: "c" }),
    ];
    const viewIndex = 1;
    const visible = events.slice(0, viewIndex + 1);
    expect(visible).toHaveLength(2);
    expect(focusEvent(visible)?.preview).toBe("b");
  });
});
