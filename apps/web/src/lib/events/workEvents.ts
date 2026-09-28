/** G3: eventos de trabalho do Computador (não conversa). */
export const WORK_EVENT_TYPES = [
  "action",
  "observation",
  "plan",
  "state_update",
] as const;

export type WorkEventType = (typeof WORK_EVENT_TYPES)[number];

export function isWorkEventType(type: string): boolean {
  return (WORK_EVENT_TYPES as readonly string[]).includes(type);
}

export function filterWorkEvents<T extends { type: string }>(events: T[]): T[] {
  return events.filter((e) => isWorkEventType(e.type));
}
