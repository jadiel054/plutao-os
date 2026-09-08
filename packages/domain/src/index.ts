/**
 * @plutao/domain
 * Core domain types for Plutão — Personal Autonomous AI Operating System
 * Aligned with PROJECT_SPECIFICATION.md (Architecture Baseline v1.0)
 *
 * Status: FOUNDATION — only entities needed for Phase 1
 */

// ============================================================
// Identity & Account
// ============================================================

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

// ============================================================
// Mission Engine (core states from spec §5)
// ============================================================

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

// ============================================================
// Task Engine (spec §6)
// ============================================================

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

// ============================================================
// Agent (minimal for Phase 1)
// ============================================================

export interface Agent {
  id: AgentId;
  userId: UserId;
  name: string;
  identity: string | null;
  personality: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Project (minimal)
// ============================================================

export interface Project {
  id: ProjectId;
  userId: UserId;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Audit / Observability foundation
// ============================================================

export type AuditEventType =
  | "user.created"
  | "user.login"
  | "user.logout"
  | "mission.created"
  | "mission.status_changed"
  | "task.created"
  | "task.status_changed"
  | "auth.password_reset_requested"
  | "auth.password_changed";

export interface AuditEvent {
  id: string;
  userId: UserId | null;
  type: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}
