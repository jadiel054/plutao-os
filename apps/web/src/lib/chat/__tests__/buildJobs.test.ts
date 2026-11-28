import { describe, expect, it } from "vitest";
import { parseChatBuildJobPayload, resolveChatBuildRunContext } from "../buildJobs";

const PLAN = {
  objective: "site de receitas",
  scope: ["landing page"],
  deliverables: ["index.html"],
  steps: ["escrever index.html"],
  toolsNeeded: ["filesystem"],
  limitations: ["sem domínio próprio"],
};

describe("buildJobs (execução durável da criação no Chat)", () => {
  it("parseChatBuildJobPayload rejeita payload inválido", () => {
    expect(parseChatBuildJobPayload(null)).toBeNull();
    expect(parseChatBuildJobPayload("x")).toBeNull();
    expect(parseChatBuildJobPayload({})).toBeNull();
    expect(parseChatBuildJobPayload({ conversationId: 42 })).toBeNull();
  });

  it("parseChatBuildJobPayload preserva conversationId, gateId, plan e buildState", () => {
    const parsed = parseChatBuildJobPayload({
      conversationId: "22222222-2222-4222-8222-222222222222",
      gateId: "33333333-3333-4333-8333-333333333333",
      plan: { objective: "site", scope: [], deliverables: [], steps: [], toolsNeeded: [], limitations: [] },
      userText: "crie um site",
      buildState: { iterations: 4, files: [{ path: "index.html", size: 12 }], toolContextMessages: [] },
    });
    expect(parsed?.conversationId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed?.gateId).toBe("33333333-3333-4333-8333-333333333333");
    expect(parsed?.plan?.objective).toBe("site");
    expect(parsed?.buildState?.iterations).toBe(4);
  });

  it("cadeia pedido → plano → job → worker: pedido e plano chegam ao contexto de execução", () => {
    const gatePayload = {
      conversationId: "22222222-2222-4222-8222-222222222222",
      plan: PLAN,
      userText: "crie um site de receitas",
    };
    const jobPayload = parseChatBuildJobPayload({ ...gatePayload, gateId: "g1" });
    if (!jobPayload) throw new Error("payload inválido");
    const ctx = resolveChatBuildRunContext(jobPayload);
    expect(ctx).not.toBeNull();
    expect(ctx?.userText).toBe("crie um site de receitas");
    expect(ctx?.planText).toContain("Objetivo: site de receitas");
    expect(ctx?.planText).toContain("escrever index.html");
  });

  it("resolveChatBuildRunContext é fail-closed: null sem pedido e sem checkpoint", () => {
    const empty = parseChatBuildJobPayload({
      conversationId: "22222222-2222-4222-8222-222222222222",
      gateId: "g1",
      plan: PLAN,
      userText: "",
    });
    expect(resolveChatBuildRunContext(empty!)).toBeNull();
  });

  it("resolveChatBuildRunContext permite retomada só com checkpoint", () => {
    const resumed = parseChatBuildJobPayload({
      conversationId: "22222222-2222-4222-8222-222222222222",
      gateId: "g1",
      plan: null,
      userText: "",
      buildState: { iterations: 3, files: [], toolContextMessages: [] },
    });
    const ctx = resolveChatBuildRunContext(resumed!);
    expect(ctx).not.toBeNull();
    expect(ctx?.planText).toBeNull();
  });

  it("parseChatBuildJobPayload normaliza campos ausentes", () => {
    const parsed = parseChatBuildJobPayload({ conversationId: "c1" });
    expect(parsed?.gateId).toBeNull();
    expect(parsed?.plan).toBeNull();
    expect(parsed?.userText).toBe("");
    expect(parsed?.buildState).toBeNull();
  });
});
