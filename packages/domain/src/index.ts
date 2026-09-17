/**
 * @plutao/domain
 * Core domain types for Plutão — Personal Autonomous Operating System
 *
 * Status: FOUNDATION + Mission Workspace + Agent kernel + Connectors
 */

export type UserId = string;
export type AgentId = string;
export type ProjectId = string;
export type MissionId = string;
export type TaskId = string;

export interface User {
  id: UserId;
  email: string;
  name: string | null;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: UserId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export type MissionStatus =
  | "CREATED"
  | "UNDERSTANDING"
  | "PLANNING"
  | "EXECUTING"
  | "VERIFYING"
  | "CORRECTING"
  | "COMPLETED"
  | "BLOCKED"
  | "CANCELLED"
  | "FAILED";

export interface Mission {
  id: MissionId;
  userId: UserId;
  projectId: ProjectId | null;
  objective: string;
  context: string | null;
  constraints: string | null;
  plan: unknown | null;
  definitionOfDone: string | null;
  currentState: MissionStatus;
  completedSteps: string[];
  pendingSteps: string[];
  evidence: unknown[];
  errors: unknown[];
  decisions: unknown[];
  status: MissionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskStatus =
  | "CREATED"
  | "READY"
  | "RUNNING"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface Task {
  id: TaskId;
  missionId: MissionId;
  parentTaskId: TaskId | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface Agent {
  id: AgentId;
  userId: UserId;
  name: string;
  identity: string | null;
  personality: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: ProjectId;
  userId: UserId;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditEventType =
  | "user.created"
  | "user.login"
  | "user.logout"
  | "mission.created"
  | "mission.status_changed"
  | "task.created"
  | "task.status_changed"
  | "auth.password_reset_requested"
  | "auth.password_changed"
  | "connector.status_changed";

export interface AuditEvent {
  id: string;
  userId: UserId | null;
  type: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export type {
  AgentLoopState,
  LoopIterationResult,
  AgentLoopResult,
  ModelProvider,
  ToolDispatcher,
} from "./runtime/agentLoop";
export {
  MIN_ITERATIONS,
  MAX_ITERATIONS,
  DEFAULT_ITERATIONS,
  createInitialState,
  runAgentLoop,
  formatLoopState,
  formatLoopResult,
} from "./runtime/agentLoop";

export type {
  LocalModelConfig,
  LocalModelStatus,
} from "./runtime/providers/localProvider";
export {
  LocalProvider,
  DEFAULT_LOCAL_MODEL_ID,
  FALLBACK_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_CONFIG,
  createLocalProvider,
  getLocalProvider,
  resetLocalProvider,
} from "./runtime/providers/localProvider";

export type {
  ModelMode,
  ModelProviderSelection,
  ModelSelectorConfig,
  ModelSelector,
} from "./runtime/modelSelector";
export {
  DEFAULT_MODEL_MODE,
  DEFAULT_OFFLINE_MODEL_ID,
  DEFAULT_ONLINE_MODEL_ID,
  STORAGE_KEY,
  DEFAULT_SELECTOR_CONFIG,
  checkOnlineStatus,
  checkWebGPUSupport,
  getStoredMode,
  saveMode,
  clearStoredMode,
  createModelSelector,
  getModelSelector,
  resetModelSelector,
  getModelProvider,
} from "./runtime/modelSelector";

export {
  PRESET_MODELS,
  filterModels,
} from "./models/registry";

export type {
  AIModel,
  ModelProviderType,
  ModelCategory,
  HardwareRequirement,
  ModelStatusState,
  ModelDownloadProgress,
  ModelFilterOptions,
} from "./models/registry";

export type {
  PendingIntentStatus,
  PendingIntentType,
  CreateMissionPayload,
  PendingIntentResult,
  PendingIntent,
} from "./intents/types";

export {
  canTransitionIntentStatus,
  transitionIntent,
} from "./intents/types";

export type {
  MissionStepStatus,
  MissionEventKind,
  ChatIntent,
  ProjectBrief,
  MissionStep,
  MissionEvent,
  MissionPlanV1,
} from "./mission-workspace";

export {
  canTransitionStep,
  canStartStep,
  isStepInFailureLoop,
  countPassedSteps,
  getActiveStep,
  createEmptyPlan,
  createPlanFromTitles,
  parseMissionPlan,
  applyStepTransition,
} from "./mission-workspace";

export type { AgentRoleId, AgentRoleDefinition } from "./agents";
export {
  AGENT_ROLES,
  AGENT_ROLE_ORDER,
  getAgentRole,
  listAgentRoles,
} from "./agents";

export type {
  ConnectorProviderId,
  ConnectorStatus,
  ConnectorCapability,
  ConnectorPublicView,
  ConnectorCatalogEntry,
} from "./connectors";
export {
  CONNECTOR_CATALOG,
  canTransitionConnector,
  getCatalogEntry,
} from "./connectors";
