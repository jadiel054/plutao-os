export const ARTEMIS_TASK_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "timeout",
  "cancelled",
] as const;

export type ArtemisTaskStatus = (typeof ARTEMIS_TASK_STATUSES)[number];
export type ArtemisProfile = "flash";
export const AUTOMATION_EXECUTORS = ["artemis", "maestro", "appium", "playwright", "androidworld"] as const;
export type AutomationExecutor = (typeof AUTOMATION_EXECUTORS)[number];

export type ArtemisTaskInput = {
  prompt: string;
  deviceSerial?: string | null;
  profile?: ArtemisProfile | null;
  nonce: string;
  missionId?: string | null;
  nodeId?: string | null;
  _gateId?: string | null;
  executor?: AutomationExecutor | null;
  flow?: string | null;
  url?: string | null;
  actions?: unknown[] | null;
};

export type ArtemisTaskPublic = {
  id: string;
  userId: string;
  missionId: string | null;
  executionId: string | null;
  nodeId: string | null;
  executor: AutomationExecutor;
  nonce: string;
  prompt: string;
  deviceSerial: string;
  profile: ArtemisProfile;
  status: ArtemisTaskStatus;
  githubRunId: string | null;
  githubRunAttempt: number | null;
  gateId: string | null;
  traceUrl: string | null;
  summary: string | null;
  error: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtemisArtifactDownload = {
  id: string;
  name: string;
  size: number;
  bytes: Buffer;
};

export type ArtemisRunStatus = {
  id: string;
  status: string;
  conclusion: string | null;
  runAttempt: number | null;
  htmlUrl: string | null;
  logsUrl: string | null;
  updatedAt: string | null;
};

export function isArtemisTaskStatus(value: string): value is ArtemisTaskStatus {
  return (ARTEMIS_TASK_STATUSES as readonly string[]).includes(value);
}

export function isAutomationExecutor(value: string): value is AutomationExecutor {
  return (AUTOMATION_EXECUTORS as readonly string[]).includes(value);
}
