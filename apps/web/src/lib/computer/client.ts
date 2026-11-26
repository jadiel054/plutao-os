/**
 * Fase 3 — cliente do computador para o browser. Nunca conhece segredos:
 * só fala com as rotas autenticadas do Plutão.
 */
export type ComputerInputPayload =
  | { kind: "mouse"; type: "move" | "down" | "up" | "click"; x: number; y: number; button?: "left" | "right" | "middle"; clickCount?: number }
  | { kind: "key"; type: "press" | "down" | "up"; text: string }
  | { kind: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "navigate"; url: string };

export async function sendComputerInput(
  conversationId: string,
  action: ComputerInputPayload
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/computer/${encodeURIComponent(conversationId)}/session/input`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
