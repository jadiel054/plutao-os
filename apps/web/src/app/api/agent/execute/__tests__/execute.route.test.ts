import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/audit", () => ({
  checkMcpRateLimit: vi.fn(async () => ({ ok: true as const })),
}));

import { checkMcpRateLimit } from "@/lib/mcp/audit";
import { GET, POST } from "../route";

const VALID_KEY = "test-aegis-key-32chars-minimum!!";

function req(method: "GET" | "POST", opts?: { key?: string | null; body?: unknown }) {
  const headers = new Headers();
  if (opts?.key) headers.set("x-api-key", opts.key);
  const init: RequestInit = { method, headers };
  if (method === "POST") {
    init.body = JSON.stringify(opts?.body ?? {});
    headers.set("content-type", "application/json");
  }
  return new Request("http://localhost/api/agent/execute", init);
}

describe("/api/agent/execute hardening", () => {
  const prev = process.env.AEGIS_API_KEY;

  beforeEach(() => {
    vi.mocked(checkMcpRateLimit).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.AEGIS_API_KEY;
    else process.env.AEGIS_API_KEY = prev;
  });

  it("fail-closed when AEGIS_API_KEY is unset (POST 503)", async () => {
    delete process.env.AEGIS_API_KEY;
    const res = await POST(req("POST", { body: { command: "execute_real" } }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("fail-closed when AEGIS_API_KEY is unset (GET 503)", async () => {
    delete process.env.AEGIS_API_KEY;
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
  });

  it("wrong key returns 401", async () => {
    process.env.AEGIS_API_KEY = VALID_KEY;
    const res = await POST(req("POST", { key: "wrong-key", body: {} }));
    expect(res.status).toBe(401);
  });

  it("correct key without body approved still returns awaiting_approval and write_ok false", async () => {
    process.env.AEGIS_API_KEY = VALID_KEY;
    const res = await POST(
      req("POST", {
        key: VALID_KEY,
        body: { command: "execute_real", title: "t", input: "x" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("awaiting_approval");
    expect(json.write_ok).toBe(false);
    expect(json.gated).toBe(true);
  });

  it("body approved:true does NOT authorize write", async () => {
    process.env.AEGIS_API_KEY = VALID_KEY;
    const res = await POST(
      req("POST", {
        key: VALID_KEY,
        body: {
          command: "execute_real",
          approved: true,
          approved_by: "attacker",
          gate: "approved",
          title: "bypass attempt",
        },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("awaiting_approval");
    expect(json.write_ok).toBe(false);
    expect(String(json.output)).toContain("awaiting_approval");
  });

  it("GET with valid key does not expose smoke_target", async () => {
    process.env.AEGIS_API_KEY = VALID_KEY;
    const res = await GET(req("GET", { key: VALID_KEY }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.smoke_target).toBeUndefined();
    expect(json.service).toBe("plutao-agent-execute");
  });

  it("GET without key returns 401 when key configured", async () => {
    process.env.AEGIS_API_KEY = VALID_KEY;
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });
});
