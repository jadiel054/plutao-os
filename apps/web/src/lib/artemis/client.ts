import { sanitizeError } from "@/lib/security/sanitize";
import type { ArtemisArtifactDownload, ArtemisRunStatus, AutomationExecutor } from "./types";

const GITHUB_API = "https://api.github.com";
const DEFAULT_REPOSITORY = "jadiel054/plutao-os";
const DEFAULT_WORKFLOW = "artemis-run.yml";
const DEFAULT_REF = "main";
const DISPATCH_TIMEOUT_MS = 10_000;
const ARTIFACT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_EXECUTOR_WORKFLOWS: Record<Exclude<AutomationExecutor, "artemis">, string> = {
  maestro: "maestro-run.yml",
  appium: "appium-run.yml",
  playwright: "playwright-run.yml",
  androidworld: "androidworld-eval.yml",
};

type GitHubRun = {
  id?: number;
  status?: string | null;
  conclusion?: string | null;
  run_attempt?: number | null;
  html_url?: string | null;
  logs_url?: string | null;
  updated_at?: string | null;
  display_title?: string | null;
  name?: string | null;
  head_branch?: string | null;
};

function getPat(): string {
  const pat = process.env.ARTEMIS_GH_PAT?.trim();
  if (!pat) throw new Error("ARTEMIS_GH_PAT_NOT_CONFIGURED");
  return pat;
}

function getRepository(): string {
  return process.env.ARTEMIS_GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
}

function getWorkflowFile(): string {
  return process.env.ARTEMIS_WORKFLOW_FILE?.trim() || DEFAULT_WORKFLOW;
}

function getRef(): string {
  return process.env.ARTEMIS_GITHUB_REF?.trim() || DEFAULT_REF;
}

export function isArtemisEnabled(): boolean {
  return process.env.ARTEMIS_ENABLED?.trim().toLowerCase() === "true";
}

export function getArtemisDefaultDevice(): string | null {
  const value = process.env.ARTEMIS_DEFAULT_DEVICE?.trim();
  return value || null;
}

async function githubFetch(path: string, init: RequestInit = {}, timeoutMs = DISPATCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${GITHUB_API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${getPat()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Plutao-OS-Artemis",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("GITHUB_ARTEMIS_REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    detail = typeof parsed.message === "string" ? parsed.message : "";
  } catch {
    detail = "";
  }
  return new Error(`${fallback}${detail ? `: ${sanitizeError(detail)}` : `_${response.status}`}`);
}

function asRunStatus(run: GitHubRun): ArtemisRunStatus {
  return {
    id: String(run.id ?? ""),
    status: String(run.status ?? "unknown"),
    conclusion: run.conclusion ? String(run.conclusion) : null,
    runAttempt: typeof run.run_attempt === "number" ? run.run_attempt : null,
    htmlUrl: run.html_url ? String(run.html_url) : null,
    logsUrl: run.logs_url ? String(run.logs_url) : null,
    updatedAt: run.updated_at ? String(run.updated_at) : null,
  };
}

async function findRunByNonce(nonce: string): Promise<ArtemisRunStatus> {
  const deadline = Date.now() + DISPATCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await githubFetch(
      `/repos/${getRepository()}/actions/runs?event=workflow_dispatch&branch=${encodeURIComponent(getRef())}&per_page=30`
    );
    if (!response.ok) throw await responseError(response, "GITHUB_RUN_LOOKUP_FAILED");
    const payload = (await response.json()) as { workflow_runs?: GitHubRun[] };
    const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
    const match = runs.find((run) =>
      [run.display_title, run.name, run.head_branch]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.includes(nonce))
    );
    if (match?.id) return asRunStatus(match);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("GITHUB_RUN_NOT_VISIBLE_AFTER_DISPATCH");
}

export async function dispatchWorkflow(
  nonce: string,
  prompt: string,
  device: string,
  profile: "flash" = "flash"
): Promise<{ githubRunId: string; githubRunAttempt: number | null; htmlUrl: string | null }> {
  const response = await githubFetch(
    `/repos/${getRepository()}/actions/workflows/${encodeURIComponent(getWorkflowFile())}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: getRef(),
        inputs: {
          prompt,
          nonce,
          device_tailnet_name: device,
          profile,
          artemis_commit:
            process.env.ARTEMIS_COMMIT?.trim() || "351ca8422f7b5b54e80a9c1ce03a222e02415b6b",
        },
      }),
    }
  );
  if (!response.ok) throw await responseError(response, "GITHUB_WORKFLOW_DISPATCH_FAILED");

  const run = await findRunByNonce(nonce);
  if (!run.id) throw new Error("GITHUB_RUN_ID_MISSING");
  return { githubRunId: String(run.id), githubRunAttempt: run.runAttempt, htmlUrl: run.htmlUrl };
}

export async function dispatchExecutorWorkflow(
  executor: Exclude<AutomationExecutor, "artemis">,
  nonce: string,
  inputs: Record<string, string>
): Promise<{ githubRunId: string; githubRunAttempt: number | null; htmlUrl: string | null }> {
  const workflowEnv = `AUTOMATION_${executor.toUpperCase()}_WORKFLOW`;
  const workflow = process.env[workflowEnv]?.trim() || DEFAULT_EXECUTOR_WORKFLOWS[executor];
  const response = await githubFetch(
    `/repos/${getRepository()}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: getRef(), inputs: { ...inputs, nonce } }),
    }
  );
  if (!response.ok) throw await responseError(response, `${executor.toUpperCase()}_WORKFLOW_DISPATCH_FAILED`);
  const run = await findRunByNonce(nonce);
  if (!run.id) throw new Error("GITHUB_RUN_ID_MISSING");
  return { githubRunId: String(run.id), githubRunAttempt: run.runAttempt, htmlUrl: run.htmlUrl };
}

export async function getRunStatus(runId: string): Promise<ArtemisRunStatus> {
  const response = await githubFetch(`/repos/${getRepository()}/actions/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) throw await responseError(response, "GITHUB_RUN_STATUS_FAILED");
  return asRunStatus((await response.json()) as GitHubRun);
}

export async function cancelWorkflowRun(runId: string): Promise<void> {
  const response = await githubFetch(`/repos/${getRepository()}/actions/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
  if (!response.ok && response.status !== 409) {
    throw await responseError(response, "GITHUB_RUN_CANCEL_FAILED");
  }
}

export async function getRunFailureSummary(runId: string): Promise<string> {
  const response = await githubFetch(
    `/repos/${getRepository()}/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`
  );
  if (!response.ok) throw await responseError(response, "GITHUB_RUN_JOBS_FAILED");
  const payload = (await response.json()) as {
    jobs?: Array<{ name?: string; status?: string; conclusion?: string | null }>;
  };
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const lines = jobs
    .slice(-8)
    .map((job) => `${String(job.name ?? "job")} · ${String(job.status ?? "unknown")}/${String(job.conclusion ?? "—")}`);
  return lines.length > 0 ? lines.join("\n") : "Nenhum job do workflow foi retornado pelo GitHub.";
}

export async function downloadArtifacts(runId: string, executor: AutomationExecutor = "artemis"): Promise<ArtemisArtifactDownload[]> {
  const response = await githubFetch(
    `/repos/${getRepository()}/actions/runs/${encodeURIComponent(runId)}/artifacts?per_page=100`
  );
  if (!response.ok) throw await responseError(response, "GITHUB_ARTIFACTS_LIST_FAILED");
  const payload = (await response.json()) as {
    artifacts?: Array<{
      id?: number;
      name?: string;
      size_in_bytes?: number;
      expired?: boolean;
      archive_download_url?: string;
    }>;
  };
  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  const downloaded: ArtemisArtifactDownload[] = [];

  for (const artifact of artifacts.filter(
    (item) => !item.expired && typeof item.archive_download_url === "string" && String(item.name ?? "").toLowerCase().startsWith(executor === "artemis" ? "artemis" : executor)
  )) {
    const archive = await githubFetch(artifact.archive_download_url!.replace(GITHUB_API, ""), {}, 30_000);
    if (!archive.ok) throw await responseError(archive, "GITHUB_ARTIFACT_DOWNLOAD_FAILED");
    const bytes = Buffer.from(await archive.arrayBuffer());
    if (bytes.byteLength > ARTIFACT_MAX_BYTES) throw new Error("GITHUB_ARTIFACT_TOO_LARGE");
    downloaded.push({
      id: String(artifact.id ?? artifact.name ?? "artifact"),
      name: String(artifact.name ?? "artemis-traces.zip"),
      size: bytes.byteLength,
      bytes,
    });
  }
  return downloaded;
}
