import { appendFileSync } from "node:fs";
import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import { extractFilesystemFacts } from "../apps/web/src/lib/missions/dod";

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

type JsonRecord = Record<string, unknown>;
type MissionRef = { id: string; objective: string; tag: string };
type RuntimeRef = { executionId: string; jobId: string };
type Snapshot = {
  mission: JsonRecord;
  executions: JsonRecord[];
  execution: JsonRecord | null;
  job: JsonRecord | null;
};

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function runKey(): string {
  const runId = process.env.GITHUB_RUN_ID || String(Date.now());
  const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  return `${runId}-${attempt}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

function appendSummary(
  scenario: string,
  fields: Record<string, string | number | boolean | undefined>
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
  const run = `${process.env.GITHUB_RUN_ID || "local"}.${process.env.GITHUB_RUN_ATTEMPT || "1"}`;
  const json = JSON.stringify({ scenario, run, ...safe });
  console.log(`[PACKAGE_B] ${json}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = Object.entries({ scenario, run, ...safe })
    .map(([key, value]) => `| ${key} | ${String(value).replace(/[|\n`]/g, " ")} |`)
    .join("\n");
  appendFileSync(summaryPath, `\n### Package B — ${scenario}\n\n| Campo | Resultado |\n|---|---|\n${rows}\n`);
}

async function login(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  requireCondition(Boolean(email && password), "E2E_CREDENTIALS_MISSING");

  await page.goto("/login");
  await page.locator("#login-email").fill(email!);
  await page.locator("#login-password").fill(password!);
  await page.getByRole("button", { name: "Entrar com e-mail" }).click();
  await expect(page).toHaveURL(/\/cockpit/, { timeout: 20_000 });
}

async function jsonResponse(
  response: Awaited<ReturnType<Page["request"]["get"]>>,
  expectedStatuses: number[],
  operation: string
): Promise<JsonRecord> {
  requireCondition(
    expectedStatuses.includes(response.status()),
    `${operation}_HTTP_${response.status()}`
  );
  return record(await response.json().catch(() => null));
}

async function getJson(page: Page, path: string, operation = "GET"): Promise<JsonRecord> {
  return jsonResponse(await page.request.get(path), [200], operation);
}

async function postJson(
  page: Page,
  path: string,
  body: JsonRecord,
  expectedStatuses: number[] = [200],
  operation = "POST"
): Promise<JsonRecord> {
  return jsonResponse(
    await page.request.post(path, { data: body }),
    expectedStatuses,
    operation
  );
}

async function patchJson(
  page: Page,
  path: string,
  body: JsonRecord,
  expectedStatuses: number[] = [200],
  operation = "PATCH"
): Promise<JsonRecord> {
  return jsonResponse(
    await page.request.patch(path, { data: body }),
    expectedStatuses,
    operation
  );
}

async function createMission(
  page: Page,
  options: {
    tag: string;
    objective: string;
    context: string;
    verifyIdempotency?: boolean;
  }
): Promise<MissionRef> {
  const key = `package-b-${runKey()}-${options.tag}`;
  const body = {
    objective: options.objective,
    context: options.context,
    constraints: "Dados sintéticos; sem PII; nenhum acesso a missões de terceiros.",
    definitionOfDone: null,
    source: "cockpit",
    idempotencyKey: key,
  };
  const first = await page.request.post("/api/missions", {
    data: body,
    headers: { "x-idempotency-key": key },
  });
  const firstData = await jsonResponse(first, [201], "MISSION_CREATE");
  const mission = record(firstData.mission);
  const missionId = String(mission.id ?? "");
  requireCondition(Boolean(missionId), "MISSION_ID_MISSING");

  if (options.verifyIdempotency) {
    const replay = await page.request.post("/api/missions", {
      data: body,
      headers: { "x-idempotency-key": key },
    });
    const replayData = await jsonResponse(replay, [200], "MISSION_IDEMPOTENT_REPLAY");
    requireCondition(
      record(replayData.mission).id === missionId && replayData.deduplicated === true,
      "MISSION_IDEMPOTENT_REPLAY_MISMATCH"
    );

    const conflict = await page.request.post("/api/missions", {
      data: { ...body, objective: `${body.objective} — payload diferente` },
      headers: { "x-idempotency-key": key },
    });
    await jsonResponse(conflict, [409], "MISSION_IDEMPOTENCY_CONFLICT");
  }

  return { id: missionId, objective: options.objective, tag: options.tag };
}

async function getPlan(page: Page, missionId: string): Promise<JsonRecord> {
  return getJson(page, `/api/missions/${missionId}/plan`, "MISSION_PLAN_GET");
}

async function patchPlan(
  page: Page,
  missionId: string,
  body: JsonRecord,
  expectedStatuses: number[] = [200],
  operation = "MISSION_PLAN_PATCH"
): Promise<JsonRecord> {
  return jsonResponse(
    await page.request.patch(`/api/missions/${missionId}/plan`, { data: body }),
    expectedStatuses,
    operation
  );
}

async function createPlan(
  page: Page,
  missionId: string,
  stepTitles: string[]
): Promise<{ graph: JsonRecord; nodes: JsonRecord[] }> {
  const created = await patchPlan(page, missionId, {
    action: "create_plan",
    stepTitles,
    brief: { objective: "Pacote B — teste sintético em produção" },
  });
  const graph = record(created.graph);
  const nodes = records(graph.nodes);
  requireCondition(graph.version === 2 && nodes.length === stepTitles.length, "GRAPH_CREATE_INVALID");
  return { graph, nodes };
}

async function assignSpecialist(
  page: Page,
  missionId: string,
  nodeId: string,
  specialistProfileId: string,
  requiredCapabilities: string[],
  expectedStatuses: number[] = [200],
  operation = "SPECIALIST_ASSIGN"
): Promise<JsonRecord> {
  return patchPlan(
    page,
    missionId,
    { action: "assign_specialist", nodeId, specialistProfileId, requiredCapabilities },
    expectedStatuses,
    operation
  );
}

async function alignPlan(page: Page, missionId: string): Promise<JsonRecord> {
  return patchPlan(page, missionId, { action: "align" }, [200], "PLAN_ALIGN");
}

async function enqueueMission(page: Page, missionId: string): Promise<RuntimeRef> {
  const queued = await postJson(
    page,
    `/api/missions/${missionId}/autonomous-run`,
    { maxIterations: 5 },
    [202],
    "MISSION_DURABLE_ENQUEUE"
  );
  const executionId = String(queued.executionId ?? "");
  const jobId = String(queued.jobId ?? "");
  requireCondition(queued.ok === true && Boolean(executionId && jobId), "DURABLE_ENQUEUE_FIELDS_MISSING");
  return { executionId, jobId };
}

async function snapshot(page: Page, missionId: string, executionId: string): Promise<Snapshot> {
  const [missionData, runtimeData] = await Promise.all([
    getJson(page, `/api/missions/${missionId}`, "MISSION_STATUS_GET"),
    getJson(page, `/api/missions/${missionId}/executions`, "MISSION_EXECUTIONS_GET"),
  ]);
  const mission = record(missionData.mission);
  const executions = records(runtimeData.executions);
  return {
    mission,
    executions,
    execution: executions.find((item) => item.id === executionId) ?? null,
    job: runtimeData.runtimeJob ? record(runtimeData.runtimeJob) : null,
  };
}

function graphRuntime(execution: JsonRecord | null): JsonRecord {
  return record(record(execution?.checkpoint).missionGraphRuntime);
}

function evidenceArray(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return records(value);
  if (typeof value === "string") {
    try {
      return records(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function nodeEvidence(mission: JsonRecord, executionId: string, nodeId: string): JsonRecord[] {
  return evidenceArray(mission.evidence).filter((item) => {
    const metadata = record(item.metadata);
    return (
      item.executionId === executionId &&
      metadata.missionNodeId === nodeId &&
      !String(item.content ?? "").includes("GATE_PENDING")
    );
  });
}

function readbackForPath(evidence: JsonRecord[], path: string): string | null {
  const facts = extractFilesystemFacts(
    evidence.map((item) => ({
      type: typeof item.type === "string" ? item.type : undefined,
      content: typeof item.content === "string" ? item.content : undefined,
      source: typeof item.source === "string" ? item.source : undefined,
    }))
  );
  const read = facts.reads.find(
    (item) => (item.path === path || item.path.endsWith(path)) && typeof item.content === "string"
  );
  return read?.content ?? null;
}

function writeResultCount(evidence: JsonRecord[], path: string): number {
  const quotedPath = JSON.stringify(path);
  return evidence.filter((item) => {
    if (item.type !== "tool_result") return false;
    const content = String(item.content ?? "");
    return (
      content.includes(quotedPath) &&
      /"size"\s*:\s*\d+/.test(content) &&
      !/"content"\s*:/.test(content)
    );
  }).length;
}

function countBullets(content: string): number {
  return content.split(/\r?\n/).filter((line) => /^\s*(?:[-*•]|(?:caso|teste)\s*\d)/i.test(line)).length;
}

function normalized(content: string): string {
  return content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function qualityScore(role: "software_engineer" | "teaching_assistant", content: string): number {
  const text = normalized(content);
  const checks = role === "software_engineer"
    ? [
        /idempot/.test(text),
        /\b409\b/.test(text),
        /propriet|owner|autentic/.test(text),
        countBullets(content) >= 3,
      ]
    : [
        /idempot/.test(text),
        (content.match(/\?/g) ?? []).length >= 3,
        /gabarito|respostas|resposta/.test(text),
        /retry|reenvio|repet/.test(text),
      ];
  return checks.filter(Boolean).length;
}

async function gatesForMission(page: Page, missionId: string): Promise<JsonRecord[]> {
  const response = await getJson(page, `/api/gates?missionId=${encodeURIComponent(missionId)}`, "MISSION_GATES_GET");
  return records(response.gates);
}

async function decideGate(page: Page, gateId: string, decision: "approve" | "reject", expectedStatuses = [200]): Promise<JsonRecord> {
  return jsonResponse(
    await page.request.post(`/api/gates/${gateId}`, { data: { decision } }),
    expectedStatuses,
    `WRITE_GATE_${decision.toUpperCase()}`
  );
}

async function cancelOwnMission(page: Page, missionId: string): Promise<void> {
  try {
    for (const gate of await gatesForMission(page, missionId)) {
      const gateId = String(gate.id ?? "");
      if (gateId) await decideGate(page, gateId, "reject").catch(() => undefined);
    }
  } catch {
    // Cleanup remains best-effort and is restricted to the synthetic test mission.
  }
  try {
    const data = await getJson(page, `/api/missions/${missionId}`, "CLEANUP_MISSION_GET");
    const status = String(record(data.mission).status ?? "").toUpperCase();
    if (!["COMPLETED", "CANCELLED", "FAILED", "INCONCLUSIVE"].includes(status)) {
      await patchJson(page, `/api/missions/${missionId}`, { action: "cancel" }, [200], "CLEANUP_MISSION_CANCEL");
    }
  } catch {
    // Keep the original test failure as the primary result.
  }
}

async function assertGithubTestAccount(page: Page): Promise<void> {
  const data = await getJson(page, "/api/connectors", "CONNECTOR_PREFLIGHT");
  const github = records(data.connectors).find((item) => item.provider === "github");
  requireCondition(Boolean(github), "GITHUB_CONNECTOR_NOT_PRESENT");
  requireCondition(github?.status === "connected", "GITHUB_CONNECTOR_NOT_CONNECTED");
  const accountLogin = String(github?.accountLogin ?? "").trim().toLowerCase();
  requireCondition(Boolean(accountLogin), "GITHUB_CONNECTOR_ACCOUNT_UNKNOWN");
  requireCondition(accountLogin !== "jadiel054", "GITHUB_CONNECTOR_IS_FOUNDER_ACCOUNT");
  const capabilities = records(github?.capabilities);
  requireCondition(
    capabilities.some((item) => item.name === "repo_create" && item.mode === "write"),
    "GITHUB_REPO_CREATE_CAPABILITY_MISSING"
  );
}

async function assertGraphPreview(
  page: Page,
  missionId: string,
  expectedNodeCount: number
): Promise<{ graph: JsonRecord; nodes: JsonRecord[] }> {
  const created = await getPlan(page, missionId);
  const graph = record(created.graph);
  const nodes = records(graph.nodes);
  requireCondition(graph.version === 2 && nodes.length === expectedNodeCount, "GRAPH_PREVIEW_INVALID");
  return { graph, nodes };
}

async function waitForPendingGate(
  page: Page,
  missionId: string,
  executionId: string,
  jobId: string,
  timeoutMs: number
): Promise<{ gate: JsonRecord; elapsedMs: number }> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    const [pending, current] = await Promise.all([
      gatesForMission(page, missionId),
      snapshot(page, missionId, executionId),
    ]);
    if (pending.length > 0 && current.job?.id === jobId && current.job.status === "WAITING_APPROVAL") {
      requireCondition(pending.length === 1, "WRITE_GATE_PENDING_COUNT_UNEXPECTED");
      return { gate: pending[0]!, elapsedMs: Date.now() - started };
    }
    const jobStatus = String(current.job?.status ?? "").toUpperCase();
    const missionStatus = String(current.mission.status ?? "").toUpperCase();
    if (["FAILED", "CANCELLED"].includes(jobStatus) || ["FAILED", "CANCELLED"].includes(missionStatus)) {
      throw new Error("WRITE_GATE_MISSION_TERMINATED_BEFORE_PENDING");
    }
    await page.waitForTimeout(3_000);
  }
  throw new Error("WRITE_GATE_PENDING_TIMEOUT");
}

function assertExpectedRepoGate(gate: JsonRecord, repoName: string, expectedDescription: string): void {
  const expectedTarget = `github.com/new/${repoName}`;
  const summary = String(gate.summary ?? "").toLowerCase();
  requireCondition(Boolean(gate.id), "WRITE_GATE_ID_MISSING");
  requireCondition(gate.provider === "github", "WRITE_GATE_PROVIDER_MISMATCH");
  requireCondition(gate.capability === "repo_create", "WRITE_GATE_CAPABILITY_MISMATCH");
  requireCondition(gate.target === expectedTarget, "WRITE_GATE_TARGET_MISMATCH");
  requireCondition(summary.includes(repoName.toLowerCase()), "WRITE_GATE_NAME_MISMATCH");
  requireCondition(/privad/.test(summary), "WRITE_GATE_NOT_PRIVATE");
  requireCondition(gate.contentPreview === expectedDescription, "WRITE_GATE_DESCRIPTION_MISMATCH");
}

async function waitForMissionTerminal(
  page: Page,
  missionId: string,
  runtime: RuntimeRef,
  timeoutMs: number,
  onTick?: (current: Snapshot) => Promise<void>
): Promise<{ final: Snapshot; elapsedMs: number }> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    const current = await snapshot(page, missionId, runtime.executionId);
    if (current.job && current.job.id !== runtime.jobId) throw new Error("RUNTIME_JOB_ID_CHANGED");
    if (onTick) await onTick(current);
    const jobStatus = String(current.job?.status ?? "").toUpperCase();
    const executionStatus = String(current.execution?.status ?? "").toUpperCase();
    const missionStatus = String(current.mission.status ?? "").toUpperCase();
    if (["FAILED", "CANCELLED"].includes(jobStatus) || ["FAILED", "CANCELLED"].includes(executionStatus) || ["FAILED", "CANCELLED", "INCONCLUSIVE"].includes(missionStatus)) {
      throw new Error("RUNTIME_JOB_TERMINATED_WITH_FAILURE");
    }
    if (jobStatus === "SUCCEEDED" && executionStatus === "COMPLETED" && missionStatus === "COMPLETED") {
      return { final: current, elapsedMs: Date.now() - started };
    }
    await page.waitForTimeout(3_000);
  }
  throw new Error("RUNTIME_JOB_COMPLETION_TIMEOUT");
}

async function waitForRejectedGateResume(
  page: Page,
  missionId: string,
  runtime: RuntimeRef,
  timeoutMs: number,
  initialJobStatus: string
): Promise<{ final: Snapshot; elapsedMs: number; states: string[] }> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  const states: string[] = ["WAITING_APPROVAL"];
  if (initialJobStatus && initialJobStatus !== states[states.length - 1]) states.push(initialJobStatus);
  while (Date.now() < deadline) {
    const pending = await gatesForMission(page, missionId);
    if (pending.length > 0) throw new Error("WRITE_GATE_RETRIED_AFTER_REJECTION");
    const current = await snapshot(page, missionId, runtime.executionId);
    if (current.job && current.job.id !== runtime.jobId) throw new Error("RUNTIME_JOB_ID_CHANGED_AFTER_REJECTION");
    const jobStatus = String(current.job?.status ?? "").toUpperCase();
    const executionStatus = String(current.execution?.status ?? "").toUpperCase();
    const missionStatus = String(current.mission.status ?? "").toUpperCase();
    if (jobStatus && states[states.length - 1] !== jobStatus) states.push(jobStatus);
    if (["FAILED", "CANCELLED"].includes(jobStatus) || ["FAILED", "CANCELLED"].includes(executionStatus) || ["FAILED", "CANCELLED", "INCONCLUSIVE"].includes(missionStatus)) {
      throw new Error("REJECTED_JOB_RESUME_TERMINATED_WITH_FAILURE");
    }
    if (jobStatus === "SUCCEEDED" && executionStatus === "COMPLETED" && missionStatus === "COMPLETED") {
      return { final: current, elapsedMs: Date.now() - started, states };
    }
    await page.waitForTimeout(3_000);
  }
  throw new Error("REJECTED_JOB_RESUME_TIMEOUT");
}

async function verifyUnauthenticatedMissionRead(missionId: string): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL;
  requireCondition(Boolean(baseURL), "E2E_BASE_URL_MISSING");
  const anonymous = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await anonymous.get(`/api/missions/${missionId}`);
    requireCondition(response.status() === 401, "UNAUTHENTICATED_MISSION_READ_NOT_BLOCKED");
  } finally {
    await anonymous.dispose();
  }
}

async function ensureNoPendingGate(page: Page, missionId: string): Promise<void> {
  const gates = await gatesForMission(page, missionId);
  if (gates.length === 0) return;
  for (const gate of gates) {
    const id = String(gate.id ?? "");
    if (id) await decideGate(page, id, "reject").catch(() => undefined);
  }
  await cancelOwnMission(page, missionId);
  throw new Error("UNEXPECTED_WRITE_GATE_REJECTED_AND_MISSION_CANCELLED");
}

test.describe("Package B — smoke serial multi-nó e piloto (@package-b-serial)", () => {
  test("intake, idempotência, ownership autenticado, retomada serial e especialistas", async ({ page }) => {
    test.setTimeout(40 * 60 * 1000);
    const key = runKey();
    const tag = `package-b-serial-${key}`;
    const start = Date.now();
    let missionId: string | null = null;
    let succeeded = false;
    const report: Record<string, string | number | boolean | undefined> = {
      tag,
      outcome: "running",
    };

    try {
      await login(page);
      const mission = await createMission(page, {
        tag,
        objective: `Pacote B: smoke serial multi-nó e piloto de especialistas ${key}`,
        context: "Executar apenas o nó ativo do grafo. Primeiro, o engenheiro deve produzir um plano sintético de testes de API; depois, o assistente de ensino deve criar uma explicação sintética. Usar exclusivamente filesystem local da execução; não acessar conectores externos, não incluir PII ou segredos.",
        verifyIdempotency: true,
      });
      missionId = mission.id;
      report.intake = "CREATED; exact replay deduplicated; conflicting payload returned 409";

      await verifyUnauthenticatedMissionRead(mission.id);
      const ownList = await getJson(page, "/api/missions", "OWNED_MISSIONS_GET");
      requireCondition(
        records(ownList.missions).some((item) => item.id === mission.id),
        "OWNED_MISSION_MISSING_FROM_OWNER_LIST"
      );
      report.ownership = "owner-scoped list contains synthetic mission; anonymous GET returned 401; cross-account negative not tested";

      const titles = [
        "No arquivo package-b/software-engineer.md, escreva em português pelo menos 3 casos de teste para idempotência e ownership: replay da mesma chave retorna a mesma missão; mesma chave com payload diferente retorna 409; acesso sem autenticação retorna 401. Grave com filesystem e leia o arquivo de volta.",
        "No arquivo package-b/teaching-assistant.md, explique idempotência a iniciantes com uma analogia simples, um exemplo de retry/reenvio seguro, 3 perguntas com gabarito. Grave com filesystem e leia o arquivo de volta.",
      ];
      const created = await createPlan(page, mission.id, titles);
      requireCondition(created.nodes.length === 2, "SERIAL_GRAPH_NODE_COUNT_INVALID");
      const nodeIds = created.nodes.map((node) => String(node.id ?? ""));
      requireCondition(nodeIds.every(Boolean), "SERIAL_GRAPH_NODE_ID_MISSING");

      const incompatible = await page.request.patch(`/api/missions/${mission.id}/plan`, {
        data: {
          action: "assign_specialist",
          nodeId: nodeIds[1],
          specialistProfileId: "teaching_assistant",
          requiredCapabilities: ["tool:github"],
        },
      });
      await jsonResponse(incompatible, [422], "SPECIALIST_INCOMPATIBLE_CAPABILITY");
      const unknown = await page.request.patch(`/api/missions/${mission.id}/plan`, {
        data: {
          action: "assign_specialist",
          nodeId: nodeIds[1],
          specialistProfileId: "package_b_unknown_profile",
          requiredCapabilities: ["tool:filesystem"],
        },
      });
      await jsonResponse(unknown, [422], "SPECIALIST_UNKNOWN_PROFILE");
      let current = await assertGraphPreview(page, mission.id, 2);
      requireCondition(stableStringify(current.graph) === stableStringify(created.graph), "FAIL_CLOSED_ASSIGNMENT_MUTATED_GRAPH");
      report.specialistFailClosed = "incompatible GitHub capability and unknown profile both returned 422; graph unchanged";

      await assignSpecialist(page, mission.id, nodeIds[0]!, "software_engineer", ["tool:filesystem"]);
      await assignSpecialist(page, mission.id, nodeIds[1]!, "teaching_assistant", ["tool:filesystem"]);
      current = await assertGraphPreview(page, mission.id, 2);
      requireCondition(
        current.nodes[0]?.specialistProfileId === "software_engineer" &&
          current.nodes[1]?.specialistProfileId === "teaching_assistant",
        "SPECIALIST_ASSIGNMENT_NOT_PERSISTED"
      );
      const aligned = await alignPlan(page, mission.id);
      const alignedGraph = record(aligned.graph);
      requireCondition(stableStringify(alignedGraph) === stableStringify(current.graph), "GRAPH_CHANGED_DURING_ALIGN");
      const afterAlign = await assignSpecialist(
        page,
        mission.id,
        nodeIds[0]!,
        "teaching_assistant",
        ["tool:filesystem"],
        [409],
        "SPECIALIST_MUTATION_AFTER_ALIGN"
      );
      void afterAlign;
      const immutable = await assertGraphPreview(page, mission.id, 2);
      requireCondition(stableStringify(immutable.graph) === stableStringify(alignedGraph), "ALIGNED_GRAPH_MUTATED");
      report.specialists = "software_engineer → teaching_assistant assigned before align; graph immutable after align";

      const runtime = await enqueueMission(page, mission.id);
      report.executionId = runtime.executionId;
      report.jobId = runtime.jobId;
      const deadlineMs = 34 * 60 * 1000;
      const queuedAt = Date.now();
      let firstNodeContinuationSeen = false;
      let observedStates = new Set<string>();
      let finalSnapshot: Snapshot | null = null;
      while (Date.now() - queuedAt < deadlineMs) {
        await ensureNoPendingGate(page, mission.id);
        const currentSnapshot = await snapshot(page, mission.id, runtime.executionId);
        if (currentSnapshot.job && currentSnapshot.job.id !== runtime.jobId) throw new Error("RUNTIME_JOB_ID_CHANGED");
        const jobStatus = String(currentSnapshot.job?.status ?? "").toUpperCase();
        const executionStatus = String(currentSnapshot.execution?.status ?? "").toUpperCase();
        const missionStatus = String(currentSnapshot.mission.status ?? "").toUpperCase();
        observedStates.add(`${jobStatus || "UNKNOWN"}/${executionStatus || "UNKNOWN"}/${missionStatus || "UNKNOWN"}`);

        const runtimeState = graphRuntime(currentSnapshot.execution);
        const nodeStates = record(runtimeState.nodes);
        const firstState = record(nodeStates[nodeIds[0]!]);
        const secondState = record(nodeStates[nodeIds[1]!]);
        if (
          firstState.status === "PASSED" &&
          secondState.status === "PENDING" &&
          runtimeState.activeNodeId === null &&
          jobStatus === "PENDING"
        ) {
          requireCondition(firstState.attempts === 1 && secondState.attempts === 0, "FIRST_NODE_REEXECUTED_OR_SECOND_STARTED_EARLY");
          requireCondition(executionStatus === "RUNNING", "EXECUTION_NOT_RECOVERABLE_AT_CONTINUATION");
          firstNodeContinuationSeen = true;
        }
        if (jobStatus === "FAILED" || executionStatus === "FAILED" || missionStatus === "FAILED" || missionStatus === "INCONCLUSIVE") {
          throw new Error("SERIAL_RUNTIME_FAILED");
        }
        if (jobStatus === "SUCCEEDED" && executionStatus === "COMPLETED" && missionStatus === "COMPLETED") {
          finalSnapshot = currentSnapshot;
          break;
        }
        await page.waitForTimeout(3_000);
      }
      requireCondition(Boolean(finalSnapshot), "SERIAL_RUNTIME_TIMEOUT");
      requireCondition(firstNodeContinuationSeen, "ONE_NODE_PER_WORKER_INVOCATION_NOT_OBSERVED");

      const finalRuntime = graphRuntime(finalSnapshot!.execution);
      const finalNodes = record(finalRuntime.nodes);
      const executionCheckpoint = record(finalSnapshot!.execution?.checkpoint);
      const toolCalls = Array.isArray(executionCheckpoint.toolCalls) ? executionCheckpoint.toolCalls.map(String) : [];
      requireCondition(toolCalls.length === new Set(toolCalls).size, "DUPLICATE_TOOL_CALL_HASHES_IN_CHECKPOINT");
      requireCondition(stableStringify(finalSnapshot!.mission.missionGraph) === stableStringify(alignedGraph), "GRAPH_FINGERPRINT_SOURCE_CHANGED");

      const evidenceOne = nodeEvidence(finalSnapshot!.mission, runtime.executionId, nodeIds[0]!);
      const evidenceTwo = nodeEvidence(finalSnapshot!.mission, runtime.executionId, nodeIds[1]!);
      const pathOne = "package-b/software-engineer.md";
      const pathTwo = "package-b/teaching-assistant.md";
      const contentOne = readbackForPath(evidenceOne, pathOne) ?? "";
      const contentTwo = readbackForPath(evidenceTwo, pathTwo) ?? "";
      const scoreOne = qualityScore("software_engineer", contentOne);
      const scoreTwo = qualityScore("teaching_assistant", contentTwo);

      for (const [state, evidence, path, role] of [
        [record(finalNodes[nodeIds[0]!]), evidenceOne, pathOne, "software_engineer"],
        [record(finalNodes[nodeIds[1]!]), evidenceTwo, pathTwo, "teaching_assistant"],
      ] as const) {
        requireCondition(state.status === "PASSED" && state.attempts === 1, `${role.toUpperCase()}_NODE_DOD_OR_ATTEMPT_FAILED`);
        requireCondition(evidence.some((item) => item.type === "model_step"), `${role.toUpperCase()}_MODEL_EVIDENCE_MISSING`);
        requireCondition(evidence.some((item) => item.type === "tool_result"), `${role.toUpperCase()}_TOOL_EVIDENCE_MISSING`);
        requireCondition(writeResultCount(evidence, path) === 1, `${role.toUpperCase()}_WRITE_EFFECT_COUNT_NOT_ONE`);
        requireCondition(Boolean(readbackForPath(evidence, path)), `${role.toUpperCase()}_READBACK_MISSING`);
      }
      requireCondition(scoreOne >= 3, "SOFTWARE_ENGINEER_QUALITY_RUBRIC_FAILED");
      requireCondition(scoreTwo >= 3, "TEACHING_ASSISTANT_QUALITY_RUBRIC_FAILED");
      requireCondition(String(finalSnapshot!.execution?.status).toUpperCase() === "COMPLETED", "EXECUTION_NOT_COMPLETED");
      requireCondition(String(finalSnapshot!.job?.status).toUpperCase() === "SUCCEEDED", "DURABLE_JOB_NOT_SUCCEEDED");
      requireCondition(String(finalSnapshot!.mission.status).toUpperCase() === "COMPLETED", "MISSION_NOT_COMPLETED_AFTER_DOD");

      const plan = record(finalSnapshot!.mission.plan);
      const planSteps = records(plan.steps);
      const nodeLatency = (titlePath: string): number | undefined => {
        const step = planSteps.find((item) => String(item.title ?? "").includes(titlePath));
        const start = Date.parse(String(step?.startedAt ?? ""));
        const end = Date.parse(String(step?.completedAt ?? ""));
        return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined;
      };
      const durationMs = Date.now() - queuedAt;
      report.outcome = "passed";
      report.runtimeStates = [...observedStates].join(" → ");
      report.continuationObserved = true;
      report.executionStatus = "COMPLETED";
      report.jobStatus = "SUCCEEDED";
      report.missionStatus = "COMPLETED";
      report.softwareEngineerQuality = `${scoreOne}/4`;
      report.teachingAssistantQuality = `${scoreTwo}/4`;
      report.softwareEngineerLatencyMs = nodeLatency(pathOne);
      report.teachingAssistantLatencyMs = nodeLatency(pathTwo);
      report.queuedToCompletedMs = durationMs;
      report.failedNodes = 0;
      succeeded = true;
    } finally {
      if (missionId && !succeeded) await cancelOwnMission(page, missionId);
      report.outcome = succeeded ? "passed" : "failed";
      report.elapsedMs = Date.now() - start;
      appendSummary("serial-multi-node-specialists", report);
    }
  });
});

test.describe("Package B — Write Gate em conta E2E isolada (@package-b-gate)", () => {
  test.describe.configure({ mode: "serial" });

  test("preflight: GitHub conectado fora da conta do fundador @package-b-gate-preflight", async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    await assertGithubTestAccount(page);
    appendSummary("write-gate-preflight", {
      outcome: "passed",
      githubConnected: true,
      githubAccountIsFounder: false,
      repoCreateCapability: "write-gated",
    });
  });

  test("aprovação cria somente o repositório privado exatamente mostrado e retoma o mesmo job @package-b-gate-approval", async ({ page }) => {
    test.skip(process.env.PACKAGE_B_WRITE_GATE !== "enabled", "Write Gate tests were not explicitly enabled in workflow_dispatch");
    test.setTimeout(40 * 60 * 1000);
    const start = Date.now();
    const repoName = `plutao-package-b-approved-${runKey()}`.slice(0, 100);
    const tag = `package-b-gate-approve-${runKey()}`;
    let missionId: string | null = null;
    let succeeded = false;
    const report: Record<string, string | number | boolean | undefined> = {
      tag,
      repoName,
      repoPrivacy: "private",
      outcome: "running",
    };

    try {
      await login(page);
      await assertGithubTestAccount(page);
      const mission = await createMission(page, {
        tag,
        objective: `Pacote B: aprovação Write Gate privada ${runKey()}`,
        context: "Teste isolado com conta E2E; use apenas o nó ativo e a escrita privada exata exibida no Write Gate. Sem conteúdo de usuário ou segredos.",
      });
      missionId = mission.id;
      const title = `Solicite pelo GitHub a criação PRIVADA do repositório ${repoName} com descrição exata "Plutao Package B private write-gate test; no user data."; inclua missionId e aguarde o Write Gate. Após aprovação, confirme somente com repo_get; não repita a escrita.`;
      const created = await createPlan(page, mission.id, [title]);
      const nodeId = String(created.nodes[0]?.id ?? "");
      requireCondition(Boolean(nodeId), "GATE_GRAPH_NODE_MISSING");
      await assignSpecialist(page, mission.id, nodeId, "software_engineer", ["tool:github"]);
      await alignPlan(page, mission.id);
      const runtime = await enqueueMission(page, mission.id);
      report.executionId = runtime.executionId;
      report.jobId = runtime.jobId;

      const { gate, elapsedMs: gateLatencyMs } = await waitForPendingGate(page, mission.id, runtime.executionId, runtime.jobId, 18 * 60 * 1000);
      const repoDescription = "Plutao Package B private write-gate test; no user data.";
      assertExpectedRepoGate(gate, repoName, repoDescription);
      report.gateBeforeDecision = "WAITING_APPROVAL";
      report.gateLatencyMs = gateLatencyMs;
      report.jobBeforeDecision = "WAITING_APPROVAL";

      const approval = await decideGate(page, String(gate.id), "approve");
      requireCondition(approval.ok === true && approval.status === "executed" && approval.resumed === true, "WRITE_GATE_APPROVAL_NOT_EXECUTED_OR_RESUMED");
      const approvalOutput = String(approval.output ?? "");
      requireCondition(
        approvalOutput.includes(repoName) && /private:\s*true/i.test(approvalOutput),
        "WRITE_GATE_APPROVAL_RESULT_MISMATCH"
      );
      const afterApproval = await snapshot(page, mission.id, runtime.executionId);
      requireCondition(afterApproval.job?.id === runtime.jobId, "APPROVAL_CREATED_NEW_JOB_INSTEAD_OF_RESUMING");
      const approvedJobStatus = String(afterApproval.job?.status ?? "").toUpperCase();
      requireCondition(["PENDING", "RUNNING"].includes(approvedJobStatus), "APPROVED_JOB_NOT_REQUEUED");
      report.repoCreationProof = "gate execution result confirms private=true; response content omitted";
      report.jobAfterApproval = `${approvedJobStatus}; same jobId`;

      const completed = await waitForMissionTerminal(
        page,
        mission.id,
        runtime,
        22 * 60 * 1000,
        async (current) => {
          const pending = await gatesForMission(page, mission.id);
          if (pending.length > 0) {
            for (const nextGate of pending) {
              const nextId = String(nextGate.id ?? "");
              if (nextId) await decideGate(page, nextId, "reject").catch(() => undefined);
            }
            await cancelOwnMission(page, mission.id);
            throw new Error("UNEXPECTED_SECOND_WRITE_GATE_REJECTED_AND_MISSION_CANCELLED");
          }
          requireCondition(!current.job || current.job.id === runtime.jobId, "APPROVED_RUNTIME_JOB_ID_CHANGED");
        }
      );
      const finalRuntime = graphRuntime(completed.final.execution);
      const finalNodes = record(finalRuntime.nodes);
      const finalNode = record(finalNodes[nodeId]);
      requireCondition(finalNode.status === "PASSED" && finalNode.attempts === 1, "APPROVED_GATE_NODE_DOD_FAILED");
      requireCondition(String(completed.final.execution?.status).toUpperCase() === "COMPLETED", "APPROVED_GATE_EXECUTION_NOT_COMPLETED");
      requireCondition(String(completed.final.job?.status).toUpperCase() === "SUCCEEDED", "APPROVED_GATE_JOB_NOT_SUCCEEDED");
      report.outcome = "passed";
      report.gateAfterDecision = "EXECUTED";
      report.jobAfterWorkerResume = "SUCCEEDED; same jobId";
      report.executionStatus = "COMPLETED";
      report.missionStatus = "COMPLETED";
      report.resumeLatencyMs = completed.elapsedMs;
      report.totalLatencyMs = Date.now() - start;
      succeeded = true;
    } finally {
      if (missionId && !succeeded) await cancelOwnMission(page, missionId);
      report.outcome = succeeded ? "passed" : "failed";
      report.elapsedMs = Date.now() - start;
      appendSummary("write-gate-approval", report);
    }
  });

  test("rejeição impede escrita, recusa reaprovação e retoma o mesmo job @package-b-gate-rejection", async ({ page }) => {
    test.skip(process.env.PACKAGE_B_WRITE_GATE !== "enabled", "Write Gate tests were not explicitly enabled in workflow_dispatch");
    test.setTimeout(40 * 60 * 1000);
    const start = Date.now();
    const repoName = `plutao-package-b-rejected-${runKey()}`.slice(0, 100);
    const tag = `package-b-gate-reject-${runKey()}`;
    let missionId: string | null = null;
    let succeeded = false;
    const report: Record<string, string | number | boolean | undefined> = {
      tag,
      repoName,
      repoPrivacy: "private target; expected not created",
      outcome: "running",
    };

    try {
      await login(page);
      await assertGithubTestAccount(page);
      const mission = await createMission(page, {
        tag,
        objective: `Pacote B: rejeição Write Gate privada ${runKey()}`,
        context: "Teste isolado com conta E2E. Solicite apenas a criação privada mostrada no gate. Se houver rejeição, não repita a escrita; registre apenas uma nota local de rejeição.",
      });
      missionId = mission.id;
      const title = `Solicite pelo GitHub a criação PRIVADA do repositório ${repoName} com descrição exata "Plutao Package B rejected write-gate test; no user data."; inclua missionId e aguarde o Write Gate. Se rejeitado, não tente outra escrita; registre uma nota local informando que foi rejeitado.`;
      const created = await createPlan(page, mission.id, [title]);
      const nodeId = String(created.nodes[0]?.id ?? "");
      requireCondition(Boolean(nodeId), "REJECTION_GRAPH_NODE_MISSING");
      await assignSpecialist(page, mission.id, nodeId, "software_engineer", ["tool:github"]);
      await alignPlan(page, mission.id);
      const runtime = await enqueueMission(page, mission.id);
      report.executionId = runtime.executionId;
      report.jobId = runtime.jobId;

      const { gate, elapsedMs: gateLatencyMs } = await waitForPendingGate(page, mission.id, runtime.executionId, runtime.jobId, 18 * 60 * 1000);
      const repoDescription = "Plutao Package B rejected write-gate test; no user data.";
      assertExpectedRepoGate(gate, repoName, repoDescription);
      report.gateBeforeDecision = "WAITING_APPROVAL";
      report.gateLatencyMs = gateLatencyMs;

      const rejection = await decideGate(page, String(gate.id), "reject");
      requireCondition(rejection.ok === true && rejection.status === "rejected", "WRITE_GATE_REJECTION_NOT_RECORDED");
      const reapproval = await page.request.post(`/api/gates/${String(gate.id)}`, { data: { decision: "approve" } });
      await jsonResponse(reapproval, [409], "REJECTED_GATE_REAPPROVAL_MUST_FAIL");

      const released = await snapshot(page, mission.id, runtime.executionId);
      requireCondition(released.job?.id === runtime.jobId, "REJECTION_CREATED_NEW_JOB_INSTEAD_OF_RESUMING");
      const releasedJobStatus = String(released.job?.status ?? "").toUpperCase();
      const releasedExecutionStatus = String(released.execution?.status ?? "").toUpperCase();
      requireCondition(["PENDING", "RUNNING", "SUCCEEDED"].includes(releasedJobStatus), "REJECTED_JOB_NOT_REQUEUED");
      requireCondition(["RUNNING", "COMPLETED"].includes(releasedExecutionStatus), "REJECTED_EXECUTION_NOT_RECOVERABLE");
      report.jobAfterRejection = `${releasedJobStatus}; same jobId`;
      report.reapproval = "HTTP 409";
      report.externalWrite = "not executed: gate rejected before provider execution; reapproval returned 409";

      const resumed = await waitForRejectedGateResume(
        page,
        mission.id,
        runtime,
        18 * 60 * 1000,
        releasedJobStatus
      );
      const finalRuntime = graphRuntime(resumed.final.execution);
      const finalNode = record(record(finalRuntime.nodes)[nodeId]);
      requireCondition(finalNode.status === "PASSED" && finalNode.attempts === 1, "REJECTED_GATE_RESUMED_NODE_DOD_FAILED");
      requireCondition(String(resumed.final.execution?.status).toUpperCase() === "COMPLETED", "REJECTED_GATE_EXECUTION_NOT_COMPLETED");
      requireCondition(String(resumed.final.job?.status).toUpperCase() === "SUCCEEDED", "REJECTED_GATE_JOB_NOT_SUCCEEDED");
      report.outcome = "passed";
      report.gateAfterDecision = "REJECTED";
      report.jobAfterWorkerResume = "SUCCEEDED; same jobId";
      report.executionStatus = "COMPLETED";
      report.missionStatus = "COMPLETED";
      report.resumeLatencyMs = resumed.elapsedMs;
      report.resumeStates = resumed.states.join(" → ");
      report.totalLatencyMs = Date.now() - start;
      succeeded = true;
    } finally {
      if (missionId && !succeeded) await cancelOwnMission(page, missionId);
      report.outcome = succeeded ? "passed" : "failed";
      report.elapsedMs = Date.now() - start;
      appendSummary("write-gate-rejection", report);
    }
  });
});
