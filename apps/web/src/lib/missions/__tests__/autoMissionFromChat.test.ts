import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybeCreateAutoMission } from "../autoMissionFromChat";

vi.mock("@/lib/missions/createMissionRecord", () => ({
  createMissionRecord: vi.fn(async () => ({
    mission: { id: "mission-1" },
    deduplicated: false,
  })),
}));

vi.mock("@/lib/runtime/durableJobs", () => ({
  enqueueMissionExecutionJob: vi.fn(async () => ({ job: { id: "job-1" } })),
}));

import { createMissionRecord } from "@/lib/missions/createMissionRecord";
import { enqueueMissionExecutionJob } from "@/lib/runtime/durableJobs";

const CONV = "33333333-3333-4333-8333-333333333333";

describe("separação Chat × Cockpit — criação de missões pelo chat", () => {
  beforeEach(() => {
    vi.mocked(createMissionRecord).mockClear();
    vi.mocked(enqueueMissionExecutionJob).mockClear();
  });

  it("pedido de criação de sistema NO CHAT não cria missão nem job", async () => {
    const result = await maybeCreateAutoMission({
      userId: "22222222-2222-4222-8222-222222222222",
      conversationId: CONV,
      userText: "Crie um sistema completo de gerenciamento para uma padaria.",
      history: [],
    });

    expect(result).toBeNull();
    expect(createMissionRecord).not.toHaveBeenCalled();
    expect(enqueueMissionExecutionJob).not.toHaveBeenCalled();
  });

  it("pedido EXPLICITO de missão cria missão durável (runtime do Cockpit)", async () => {
    const result = await maybeCreateAutoMission({
      userId: "22222222-2222-4222-8222-222222222222",
      conversationId: CONV,
      userText: "Crie uma missão para auditar o repositório plutao-os.",
      history: [],
    });

    expect(result).not.toBeNull();
    expect(createMissionRecord).toHaveBeenCalledTimes(1);
    expect(enqueueMissionExecutionJob).toHaveBeenCalledTimes(1);
    expect(result?.missionId).toBe("mission-1");
  });

  it("confirmação curta ('sim, pode criar') NÃO cria missão — retoma criação no chat", async () => {
    const planText =
      "Plano:\n1. Criar estrutura\n2. Gerar páginas\n3. Publicar preview";
    const result = await maybeCreateAutoMission({
      userId: "22222222-2222-4222-8222-222222222222",
      conversationId: CONV,
      userText: "sim, pode criar",
      history: [{ role: "user", content: "crie um site de padaria" }],
      lastAssistantText: planText,
    });

    expect(result).toBeNull();
    expect(createMissionRecord).not.toHaveBeenCalled();
  });
});
