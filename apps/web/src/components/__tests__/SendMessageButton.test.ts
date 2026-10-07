import { describe, expect, it } from "vitest";
import { getSendMessageButtonMode } from "@/components/SendMessageButton";

describe("SendMessageButton contract", () => {
  it("uses an upward arrow and submits while idle", () => {
    expect(getSendMessageButtonMode(false)).toEqual({
      type: "submit",
      icon: "arrow-up",
      ariaLabel: "Enviar mensagem",
    });
  });

  it("uses a square and stops instead of submitting while processing", () => {
    expect(getSendMessageButtonMode(true)).toEqual({
      type: "button",
      icon: "square",
      ariaLabel: "Parar execução do agente",
    });
  });
});
