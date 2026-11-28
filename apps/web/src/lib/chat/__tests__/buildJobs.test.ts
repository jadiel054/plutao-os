import { describe, expect, it } from "vitest";
import { parseChatBuildJobPayload } from "../buildJobs";

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

  it("parseChatBuildJobPayload normaliza campos ausentes", () => {
    const parsed = parseChatBuildJobPayload({ conversationId: "c1" });
    expect(parsed?.gateId).toBeNull();
    expect(parsed?.plan).toBeNull();
    expect(parsed?.userText).toBe("");
    expect(parsed?.buildState).toBeNull();
  });
});
