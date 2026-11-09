/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST as executePost, GET as executeGet } from "../route";
import { GET as getJobStatus } from "../[jobId]/route";
import * as workerQueue from "@/lib/runtime/workerQueue";
import * as gatesService from "@/lib/connectors/gates";
import * as durableJobs from "@/lib/runtime/durableJobs";
import * as githubWrite from "@/lib/connectors/githubWrite";
import * as ensureModule from "@/lib/runtime/ensure";
import { checkMcpRateLimit } from "@/lib/mcp/audit";

const SERVICE_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_KEY = "test-aegis-secret-key-32chars-min!!";

// In-memory mock database state
let mockMissions: Array<any> = [];
let mockExecutions: Array<any> = [];
let mockRuntimeJobs: Array<any> = [];
let mockWriteGates: Array<any> = [];

const createMockDb = () => ({
  select: (_fields?: any) => {
    const queryState: any = {
      _from: null,
      _joins: [],
      _where: null,
      _limit: null,
      _orderBy: null,
      from(table: any) {
        this._from = table;
        return this;
      },
      innerJoin(table: any, condition: any) {
        this._joins.push({ table, condition });
        return this;
      },
      where(cond: any) {
        this._where = cond;
        return this;
      },
      orderBy(...args: any[]) {
        this._orderBy = args;
        return this;
      },
      limit(n: number) {
        this._limit = n;
        return this;
      },
      then(resolve: any) {
        let rows: any[] = [];
        if (queryState._joins.length > 0) {
          // Join query for [jobId] route: runtimeJobs + executions + missions
          rows = mockRuntimeJobs
            .map((job) => {
              const execution = mockExecutions.find((e) => e.id === job.executionId);
              const mission = mockMissions.find((m) => m.id === job.missionId);
              return { job, execution, mission };
            })
            .filter((r) => r.execution && r.mission);
          if (queryState._limit) rows = rows.slice(0, queryState._limit);
          return resolve(rows);
        }

        const tableName =
          queryState._from?._?.name ||
          queryState._from?.name ||
          (typeof queryState._from === "string" ? queryState._from : "");

        if (tableName.includes("missions") || queryState._from?.table === "missions") {
          rows = [...mockMissions];
        } else if (tableName.includes("write_gates") || queryState._from?.table === "write_gates") {
          rows = [...mockWriteGates];
        } else if (tableName.includes("runtime_jobs") || queryState._from?.table === "runtime_jobs") {
          const lastExecution = mockExecutions[mockExecutions.length - 1];
          if (lastExecution) {
            const found = mockRuntimeJobs.find((j) => j.executionId === lastExecution.id);
            rows = found ? [found] : [];
          } else {
            rows = [...mockRuntimeJobs];
          }
        } else if (tableName.includes("executions") || queryState._from?.table === "executions") {
          rows = [...mockExecutions];
        } else {
          if (queryState._from?.userId && queryState._from?.objective) {
            rows = [...mockMissions];
          } else if (queryState._from?.capability && queryState._from?.provider) {
            rows = [...mockWriteGates];
          } else if (queryState._from?.attempts && queryState._from?.lockToken) {
            rows = [...mockRuntimeJobs];
          } else if (queryState._from?.checkpoint) {
            rows = [...mockExecutions];
          } else {
            rows = [...mockMissions];
          }
        }

        if (queryState._limit) rows = rows.slice(0, queryState._limit);
        return resolve(rows);
      },
    };
    return queryState;
  },
  insert: (_table: any) => ({
    values: (val: any) => ({
      returning: async () => {
        const row = { id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...val };
        const tableName = _table?._?.name || _table?.name || "";
        if (tableName.includes("missions")) {
          mockMissions.push(row);
        } else if (tableName.includes("executions")) {
          mockExecutions.push(row);
        } else if (tableName.includes("runtime_jobs")) {
          mockRuntimeJobs.push(row);
        } else if (tableName.includes("write_gates")) {
          mockWriteGates.push(row);
        } else {
          if (val.objective) mockMissions.push(row);
          else if (val.checkpoint) mockExecutions.push(row);
          else if (val.attempts !== undefined) mockRuntimeJobs.push(row);
          else if (val.capability) mockWriteGates.push(row);
        }
        return [row];
      },
    }),
  }),
  update: (_table: any) => ({
    set: (val: any) => ({
      where: () => ({
        returning: async () => [val],
      }),
    }),
  }),
});

vi.mock("@/lib/db", () => ({
  getDb: () => createMockDb(),
}));

vi.mock("@plutao/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plutao/db")>();
  return {
    ...actual,
    createDb: () => createMockDb(),
  };
});

vi.mock("@/lib/mcp/audit", () => ({
  checkMcpRateLimit: vi.fn(async () => ({ ok: true as const })),
}));

describe("/api/agent/execute hardening & durable runtime", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.AEGIS_API_KEY = API_KEY;
    process.env.PLUTAO_SERVICE_USER_ID = SERVICE_USER_ID;

    mockMissions = [];
    mockExecutions = [];
    mockRuntimeJobs = [];
    mockWriteGates = [];

    vi.spyOn(ensureModule, "ensureExecutionsTable").mockResolvedValue(undefined as unknown as void);
    vi.mocked(checkMcpRateLimit).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Fase 0 Security Hardening", () => {
    it("fail-closed when AEGIS_API_KEY is unset (POST 503)", async () => {
      delete process.env.AEGIS_API_KEY;
      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "execute_real" }),
      });
      const res = await executePost(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("fail-closed when AEGIS_API_KEY is unset (GET 503)", async () => {
      delete process.env.AEGIS_API_KEY;
      const req = new Request("http://localhost/api/agent/execute", { method: "GET" });
      const res = await executeGet(req);
      expect(res.status).toBe(503);
    });

    it("wrong key returns 401 via timingSafeEqual", async () => {
      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": "invalid-key", "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await executePost(req);
      expect(res.status).toBe(401);
    });

    it("GET without key returns 401 when key configured", async () => {
      const req = new Request("http://localhost/api/agent/execute", { method: "GET" });
      const res = await executeGet(req);
      expect(res.status).toBe(401);
    });

    it("GET with valid key does not expose smoke_target", async () => {
      const req = new Request("http://localhost/api/agent/execute", {
        method: "GET",
        headers: { "x-api-key": API_KEY },
      });
      const res = await executeGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.smoke_target).toBeUndefined();
      expect(json.service).toBe("plutao-agent-execute");
    });

    it("enforces rate limit when checkMcpRateLimit returns not ok", async () => {
      vi.mocked(checkMcpRateLimit).mockResolvedValue({ ok: false, retryAfterSec: 42 });
      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await executePost(req);
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.retry_after_sec).toBe(42);
    });
  });

  describe("POST /api/agent/execute real execution & idempotency", () => {
    it("enqueues a real durable mission and returns 202 { success, job_id, mission_id, status: 'queued' }", async () => {
      const wakeSpy = vi.spyOn(workerQueue, "publishRuntimeWorkerWake").mockResolvedValue("published");

      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          command: "execute_real",
          task_id: "task-100",
          step_index: 1,
          title: "Implement feature X",
          input: "Detailed instructions for step 1",
        }),
      });

      const res = await executePost(req);
      expect(res.status).toBe(202);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe("queued");
      expect(typeof data.job_id).toBe("string");
      expect(typeof data.mission_id).toBe("string");

      expect(wakeSpy).toHaveBeenCalledWith("mission_enqueued");
      expect(mockMissions.length).toBe(1);
      expect(mockMissions[0].userId).toBe(SERVICE_USER_ID);
      expect(mockMissions[0].objective).toBe("Implement feature X");
      expect(mockMissions[0].idempotencyKey).toBe("aegis:task-100:1");
    });

    it("is idempotent: repeating the call with the same (task_id, step_index) returns the same job_id and mission_id", async () => {
      vi.spyOn(workerQueue, "publishRuntimeWorkerWake").mockResolvedValue("published");

      let assignedJobId: string | null = null;
      vi.spyOn(durableJobs, "enqueueMissionExecutionJob").mockImplementation(async () => {
        if (!assignedJobId) {
          assignedJobId = "job-idempotent-fixed-1";
        }
        return {
          job: { id: assignedJobId, status: "PENDING" } as any,
          execution: { id: "exec-idempotent-fixed-1", status: "PENDING" } as any,
          created: true,
        };
      });

      const payload = {
        command: "execute_real",
        task_id: "task-idempotent-200",
        step_index: 0,
        title: "Same task repeated",
        input: "Test body",
      };

      const req1 = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res1 = await executePost(req1);
      expect(res1.status).toBe(202);
      const data1 = await res1.json();

      const req2 = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res2 = await executePost(req2);
      expect(res2.status).toBe(202);
      const data2 = await res2.json();

      expect(data2.job_id).toBe(data1.job_id);
      expect(data2.mission_id).toBe(data1.mission_id);
      expect(mockMissions.length).toBe(1);
    });
  });

  describe("Write-gate blocking and unblocking", () => {
    it("releases pending write-gates and wakes the worker when approved=true is re-sent", async () => {
      const wakeSpy = vi.spyOn(workerQueue, "publishRuntimeWorkerWake").mockResolvedValue("published");
      const approveGateSpy = vi.spyOn(gatesService, "approveGate").mockResolvedValue({} as any);
      const releaseJobSpy = vi.spyOn(durableJobs, "releaseRuntimeJobAfterApproval").mockResolvedValue({} as any);

      const missionId = "mission-gated-1";
      const executionId = "exec-gated-1";
      const jobId = "job-gated-1";

      mockMissions.push({
        id: missionId,
        userId: SERVICE_USER_ID,
        objective: "Gated Mission",
        idempotencyKey: "aegis:task-gate-1:0",
        evidence: [],
      });
      mockExecutions.push({
        id: executionId,
        missionId,
        userId: SERVICE_USER_ID,
        status: "RUNNING",
      });
      mockRuntimeJobs.push({
        id: jobId,
        missionId,
        executionId,
        userId: SERVICE_USER_ID,
        status: "WAITING_APPROVAL",
      });
      mockWriteGates.push({
        id: "gate-1",
        userId: SERVICE_USER_ID,
        executionId,
        provider: "github",
        capability: "github.files.write",
        status: "pending",
      });

      // Mock enqueueMissionExecutionJob to return the existing job and execution
      vi.spyOn(durableJobs, "enqueueMissionExecutionJob").mockResolvedValue({
        execution: mockExecutions[0],
        job: mockRuntimeJobs[0],
        created: false,
      });

      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          command: "execute_real",
          task_id: "task-gate-1",
          step_index: 0,
          approved: true,
          approved_by: "jadiel",
        }),
      });

      const res = await executePost(req);
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.job_id).toBe(jobId);

      expect(approveGateSpy).toHaveBeenCalledWith("gate-1", SERVICE_USER_ID);
      expect(releaseJobSpy).toHaveBeenCalledWith(executionId, SERVICE_USER_ID);
      expect(wakeSpy).toHaveBeenCalledWith("write_gate_resolved");
    });
  });

  describe("Smoke command", () => {
    it("returns awaiting_approval proposal if approved is false", async () => {
      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          command: "smoke",
          task_id: "smoke-task-1",
          title: "Smoke Test",
        }),
      });
      const res = await executePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("awaiting_approval");
      expect(data.gated).toBe(true);
    });

    it("executes smoke write strictly when command is 'smoke' and approved", async () => {
      process.env.GITHUB_TOKEN = "ghp_fake_token";
      const pushSpy = vi.spyOn(githubWrite, "githubPushFiles").mockResolvedValue({
        ok: true,
        output: "Pushed 1 commit",
        commitSha: "1234567890abcdef",
        htmlUrl: "https://github.com/jadiel054/aegis-smoke-sandbox/commit/123",
      });

      const req = new Request("http://localhost/api/agent/execute", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          command: "smoke",
          task_id: "smoke-task-1",
          title: "Smoke Test",
          approved: true,
        }),
      });

      const res = await executePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.command).toBe("smoke");
      expect(data.write_ok).toBe(true);
      expect(pushSpy).toHaveBeenCalled();
      expect(mockMissions.length).toBe(0);
    });
  });

  describe("GET /api/agent/execute/[jobId]", () => {
    it("returns 503 when AEGIS_API_KEY is missing", async () => {
      delete process.env.AEGIS_API_KEY;
      const req = new Request("http://localhost/api/agent/execute/job-1", {
        headers: { "x-api-key": API_KEY },
      });
      const res = await getJobStatus(req as any, { params: Promise.resolve({ jobId: "job-1" }) });
      expect(res.status).toBe(503);
    });

    it("returns 401 when unauthorized", async () => {
      const req = new Request("http://localhost/api/agent/execute/job-1", {
        headers: { "x-api-key": "invalid-key" },
      });
      const res = await getJobStatus(req as any, { params: Promise.resolve({ jobId: "job-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns job status, output, evidence, and error correctly", async () => {
      const jobId = "job-query-1";
      const missionId = "mission-query-1";
      const executionId = "exec-query-1";

      mockMissions.push({
        id: missionId,
        userId: SERVICE_USER_ID,
        objective: "Mission Query",
        context: "Context info",
        evidence: [
          {
            id: "ev-1",
            type: "tool_result",
            content: "Step completed successfully",
            source: "runner",
            taskId: null,
            missionId,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      mockExecutions.push({
        id: executionId,
        missionId,
        userId: SERVICE_USER_ID,
        status: "COMPLETED",
        checkpoint: { output: "Final result output" },
      });
      mockRuntimeJobs.push({
        id: jobId,
        missionId,
        executionId,
        userId: SERVICE_USER_ID,
        status: "SUCCEEDED",
        lastError: null,
      });

      const req = new Request(`http://localhost/api/agent/execute/${jobId}`, {
        headers: { "x-api-key": API_KEY },
      });
      const res = await getJobStatus(req as any, { params: Promise.resolve({ jobId }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.job_id).toBe(jobId);
      expect(data.mission_id).toBe(missionId);
      expect(data.status).toBe("completed");
      expect(data.output).toBe("Final result output");
      expect(Array.isArray(data.evidence)).toBe(true);
      expect(data.evidence.length).toBe(1);
      expect(data.evidence[0].content).toBe("Step completed successfully");
      expect(data.error).toBeNull();
    });

    it("returns awaiting_approval when there is a pending write gate", async () => {
      const jobId = "job-query-pending-gate";
      const missionId = "mission-query-2";
      const executionId = "exec-query-2";

      mockMissions.push({
        id: missionId,
        userId: SERVICE_USER_ID,
        evidence: [],
      });
      mockExecutions.push({
        id: executionId,
        missionId,
        userId: SERVICE_USER_ID,
        status: "RUNNING",
      });
      mockRuntimeJobs.push({
        id: jobId,
        missionId,
        executionId,
        userId: SERVICE_USER_ID,
        status: "RUNNING",
      });
      mockWriteGates.push({
        id: "gate-unapproved",
        userId: SERVICE_USER_ID,
        executionId,
        status: "pending",
      });

      const req = new Request(`http://localhost/api/agent/execute/${jobId}`, {
        headers: { "x-api-key": API_KEY },
      });
      const res = await getJobStatus(req as any, { params: Promise.resolve({ jobId }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe("awaiting_approval");
    });
  });
});
