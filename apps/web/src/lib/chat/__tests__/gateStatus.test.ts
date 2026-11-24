import { describe, it, expect } from "vitest";
import {
  extractGateId,
  filterGatesForContext,
  gateApprovalContext,
  mapGateStatusToUi,
  normalizeToolCallGate,
  type GateWithContext,
  type WriteGateMinimalRow,
} from "../gateStatus";

describe("gateStatus unit tests", () => {
  describe("extractGateId", () => {
    it("extracts UUID from text containing GATE_PENDING and gate_id", () => {
      const text = "GATE_PENDING\ngate_id: 12345678-1234-1234-1234-123456789abc\ncapability: repo_create";
      expect(extractGateId(text)).toBe("12345678-1234-1234-1234-123456789abc");
    });

    it("returns null if text does NOT contain GATE_PENDING", () => {
      const text = "gate_id: 12345678-1234-1234-1234-123456789abc";
      expect(extractGateId(text)).toBeNull();
    });

    it("returns null for null, undefined or invalid uuid", () => {
      expect(extractGateId(null)).toBeNull();
      expect(extractGateId(undefined)).toBeNull();
      expect(extractGateId("GATE_PENDING gate_id: invalid-uuid")).toBeNull();
    });
  });

  describe("mapGateStatusToUi", () => {
    const now = new Date("2026-10-15T22:00:00Z");

    it("maps pending status to GATE_PENDING when not expired", () => {
      const row: WriteGateMinimalRow = {
        id: "g-1",
        status: "pending",
        expiresAt: "2026-10-15T22:15:00Z",
      };
      const res = mapGateStatusToUi(row, now);
      expect(res.status).toBe("GATE_PENDING");
    });

    it("maps pending status to failed with expiration output when expired", () => {
      const row: WriteGateMinimalRow = {
        id: "g-1",
        status: "pending",
        expiresAt: "2026-10-15T21:59:00Z",
      };
      const res = mapGateStatusToUi(row, now);
      expect(res.status).toBe("failed");
      expect(res.summaryOutput).toBe("Aprovação expirada.");
    });

    it("maps approved, executing, executed, failed and rejected correctly", () => {
      expect(mapGateStatusToUi({ id: "g-1", status: "approved" }, now)).toEqual({
        status: "approved",
        summaryOutput: "Gate aprovado. Executando...",
      });

      expect(mapGateStatusToUi({ id: "g-1", status: "executing" }, now)).toEqual({
        status: "executing",
        summaryOutput: "Executando...",
      });

      expect(
        mapGateStatusToUi(
          { id: "g-1", status: "executed", result: { output: "Sucesso na criacao" } },
          now
        )
      ).toEqual({
        status: "executed",
        summaryOutput: "Sucesso na criacao",
      });

      expect(
        mapGateStatusToUi({ id: "g-1", status: "failed", error: "Erro grave no conector" }, now)
      ).toEqual({
        status: "failed",
        summaryOutput: "Erro grave no conector",
      });

      expect(mapGateStatusToUi({ id: "g-1", status: "rejected" }, now)).toEqual({
        status: "rejected",
        summaryOutput: "Recusado pelo usuário.",
      });
    });

    it("returns original status if status is unknown", () => {
      expect(mapGateStatusToUi({ id: "g-1", status: "custom_status" }, now)).toEqual({
        status: "custom_status",
      });
    });
  });

  describe("normalizeToolCallGate", () => {
    it("normalizes tool call with GATE_PENDING output to status GATE_PENDING and attaches gateId", () => {
      const tc: { id: string; provider: string; capability: string; status: string; summaryOutput: string; gateId?: string } = {
        id: "tc-1",
        provider: "github",
        capability: "repo_create",
        status: "ok",
        summaryOutput: "GATE_PENDING\ngate_id: 12345678-1234-1234-1234-123456789abc",
      };
      const norm = normalizeToolCallGate(tc);
      expect(norm.status).toBe("GATE_PENDING");
      expect(norm.gateId).toBe("12345678-1234-1234-1234-123456789abc");
    });

    it("leaves tool call unchanged if output does not contain GATE_PENDING", () => {
      const tc: { id: string; provider: string; capability: string; status: string; summaryOutput: string; gateId?: string } = {
        id: "tc-1",
        provider: "github",
        capability: "repo_get",
        status: "ok",
        summaryOutput: "Repo details loaded successfully",
      };
      const norm = normalizeToolCallGate(tc);
      expect(norm.status).toBe("ok");
      expect(norm.gateId).toBeUndefined();
    });
  });

  describe("aprovações contextuais", () => {
    it("gate com missionId pertence ao Cockpit", () => {
      expect(gateApprovalContext({ id: "g-m", missionId: "mission-1" })).toBe("cockpit");
    });

    it("gate sem missionId pertence ao Chat", () => {
      expect(gateApprovalContext({ id: "g-c", missionId: null })).toBe("chat");
      expect(gateApprovalContext({ id: "g-c2" })).toBe("chat");
    });

    it("filterGatesForContext separa gates de missão dos gates do Chat", () => {
      const gates: GateWithContext[] = [
        { id: "g-chat", status: "pending", missionId: null },
        { id: "g-cockpit", status: "pending", missionId: "mission-7" },
      ];
      expect(filterGatesForContext(gates, "chat").map((g) => g.id)).toEqual(["g-chat"]);
      expect(filterGatesForContext(gates, "cockpit").map((g) => g.id)).toEqual(["g-cockpit"]);
    });

    it("nenhum gate aparece nos dois contextos ao mesmo tempo", () => {
      const gates: GateWithContext[] = [
        { id: "g-1", status: "pending" },
        { id: "g-2", status: "pending", missionId: "m-1" },
        { id: "g-3", status: "pending", missionId: "m-2" },
      ];
      const chatIds = filterGatesForContext(gates, "chat").map((g) => g.id);
      const cockpitIds = filterGatesForContext(gates, "cockpit").map((g) => g.id);
      for (const id of chatIds) {
        expect(cockpitIds).not.toContain(id);
      }
      for (const id of cockpitIds) {
        expect(chatIds).not.toContain(id);
      }
    });
  });

});
