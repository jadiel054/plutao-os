import type { CreateMissionPayload } from "@plutao/domain";

export type MissionIntakeClientInput = CreateMissionPayload & {
  source: "chat" | "cockpit";
  idempotencyKey: string;
};

/** Single first-party client entry for mission creation (chat, Cockpit, and offline sync). */
export function createMissionIntake(input: MissionIntakeClientInput): Promise<Response> {
  const { idempotencyKey, ...payload } = input;
  return fetch("/api/missions", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ ...payload, idempotencyKey }),
  });
}
