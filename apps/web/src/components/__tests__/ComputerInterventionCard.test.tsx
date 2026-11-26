// @vitest-environment jsdom
/**
 * CARD DE INTERVENÇÃO HUMANA (Parte 2 — fluxo Manus-like).
 *
 * Provas: botão "Assumir controle" aparece quando o último evento do
 * computador é waiting_human; assumir expande o navegador real; devolver
 * abre o diálogo com texto OPCIONAL; ao confirmar, o contexto vai no POST,
 * o card colapsa (volta ao Chat) e o feedback é honesto (inclusive aviso de
 * navegador novo quando a sessão expirou).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComputerInterventionCard } from "@/components/ComputerInterventionCard";

vi.mock("@/components/RealComputerView", () => ({
  RealComputerView: () => <div data-testid="real-view-stub" />,
}));

type FetchHandler = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

let handler: FetchHandler;

function jsonResponse(status: number, body: unknown): { ok: boolean; json: () => Promise<unknown> } {
  return { ok: status < 400, json: async () => body };
}

const waitingEvent = {
  source: "computer",
  type: "state_update",
  payload: {
    computer: true,
    state: "waiting_human",
    intervention: { reason: "Tela de login detectada (https://portal.test/login)", instruction: "Assuma e faça o login DIRETO no navegador. NUNCA cole senha no chat." },
    checkpoint: {
      objective: "comprar licença no portal",
      currentStep: "formulário de login",
      completedActions: ["navegou para https://portal.test"],
      nextAction: "seguir após o login",
      pageUrl: "https://portal.test/login",
      browserSession: { sessionId: "s-1", status: "ready" },
      humanIntervention: { note: null, resolvedAt: null },
      updatedAt: 1,
    },
  },
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  handler = async (url, init) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/api/computer/")) {
      return jsonResponse(200, { controller: "agent" });
    }
    if (method === "GET" && url.includes("/events")) {
      return jsonResponse(200, { events: [waitingEvent] });
    }
    if (method === "POST" && (init?.body as string)?.includes("takeover")) {
      return jsonResponse(200, { controller: "human" });
    }
    if (method === "POST" && (init?.body as string)?.includes("release")) {
      return jsonResponse(200, { controller: "agent", resume: { resumed: true } });
    }
    return jsonResponse(404, {});
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ComputerInterventionCard", () => {
  it("waiting_human na conversa → mostra motivo, próxima etapa e botão Assumir controle", async () => {
    render(<ComputerInterventionCard conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByTestId("computer-intervention-card")).toBeTruthy());
    expect(screen.getByText(/login detectada/i)).toBeTruthy();
    expect(screen.getByText(/próximo passo: seguir após o login/i)).toBeTruthy();
    expect(screen.getByTestId("intervention-takeover").textContent).toContain("Assumir controle");
    expect(screen.queryByTestId("real-view-stub")).toBeNull();
  });

  it("sem waiting_human e sem itens → card some da mensagem", async () => {
    handler = async () => jsonResponse(200, { controller: "agent", events: [] });
    render(<ComputerInterventionCard conversationId="conv-1" />);
    await waitFor(async () => {
      const events = await handler("/x", { method: "GET" });
      return events;
    });
    expect(screen.queryByTestId("computer-intervention-card")).toBeNull();
  });

  it("takeover → expande o navegador real (humano no controle) e botão de devolver aparece", async () => {
    render(<ComputerInterventionCard conversationId="conv-1" />);
    const takeover = await screen.findByTestId("intervention-takeover");
    fireEvent.click(takeover);
    await waitFor(() => expect(screen.getByTestId("real-view-stub")).toBeTruthy());
    expect(screen.getByTestId("intervention-release-open").textContent).toContain("Devolver controle a Nix");
    expect(screen.getByText(/você está no controle/i)).toBeTruthy();
  });

  it("devolução com diálogo: texto OPCIONAL é enviado no POST; sem texto não há campo obrigatório", async () => {
    render(<ComputerInterventionCard conversationId="conv-1" />);
    fireEvent.click(await screen.findByTestId("intervention-takeover"));
    fireEvent.click(await screen.findByTestId("intervention-release-open"));
    expect(screen.getByTestId("intervention-dialog")).toBeTruthy();
    fireEvent.change(screen.getByTestId("intervention-note"), { target: { value: "login feito — siga do dashboard" } });
    fireEvent.click(screen.getByTestId("intervention-release-confirm"));
    await waitFor(() => expect(screen.getByTestId("intervention-feedback")).toBeTruthy());
    expect(screen.getByTestId("intervention-feedback").textContent).toContain("Tarefa retomada");
    expect(screen.queryByTestId("real-view-stub")).toBeNull();
    const fetchMock = vi.mocked(globalThis.fetch);
    const releaseCall = fetchMock.mock.calls.find(([, init]) => (init?.body as string)?.includes("release"));
    expect(releaseCall).toBeTruthy();
    expect((releaseCall![1]!.body as string)).toContain("login feito — siga do dashboard");
  });

  it("sessão perdida: feedback mostra o aviso honesto de navegador NOVO (retomada sem mesma sessão)", async () => {
    handler = async (url, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && (init?.body as string)?.includes("release")) {
        return jsonResponse(200, {
          controller: "agent",
          resume: { resumed: true, browserNotice: "A sessão do navegador remoto foi perdida (expired) — no plano Free a reconexão abre um navegador NOVO, então a tarefa CONTINUA mas a MESMA sessão NÃO foi restaurada." },
        });
      }
      if (method === "GET" && url.includes("/api/computer/")) return jsonResponse(200, { controller: "agent" });
      if (method === "GET" && url.includes("/events")) return jsonResponse(200, { events: [waitingEvent] });
      if (method === "POST" && (init?.body as string)?.includes("takeover")) {
        return jsonResponse(200, { controller: "human" });
      }
      return jsonResponse(404, {});
    };
    render(<ComputerInterventionCard conversationId="conv-1" />);
    fireEvent.click(await screen.findByTestId("intervention-takeover"));
    fireEvent.click(await screen.findByTestId("intervention-release-open"));
    fireEvent.click(screen.getByTestId("intervention-release-confirm"));
    await waitFor(() => expect(screen.getByTestId("intervention-feedback")).toBeTruthy());
    expect(screen.getByTestId("intervention-feedback").textContent).toContain("NÃO foi restaurada");
  });

  it("takeover recusado (ex.: outra instância) → erro mostrado, sem expandir o navegador", async () => {
    handler = async (url, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && (init?.body as string)?.includes("takeover")) {
        return jsonResponse(409, { error: "ACTION_INFLIGHT", message: "Já existe uma ação em andamento." });
      }
      if (method === "GET" && url.includes("/events")) return jsonResponse(200, { events: [waitingEvent] });
      return jsonResponse(200, { controller: "agent" });
    };
    render(<ComputerInterventionCard conversationId="conv-1" />);
    fireEvent.click(await screen.findByTestId("intervention-takeover"));
    await waitFor(() => expect(screen.getByTestId("intervention-feedback")).toBeTruthy());
    expect(screen.getByTestId("intervention-feedback").textContent).toContain("ação em andamento");
    expect(screen.queryByTestId("real-view-stub")).toBeNull();
  });
});
