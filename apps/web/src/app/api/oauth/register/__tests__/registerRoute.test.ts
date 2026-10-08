import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  consumeOAuthRegistrationQuota: vi.fn(),
  createOAuthClient: vi.fn(),
  hashOAuthRegistrationIp: vi.fn(),
}));

vi.mock("@/lib/mcp/grants", () => ({
  consumeOAuthRegistrationQuota: mocks.consumeOAuthRegistrationQuota,
  createOAuthClient: mocks.createOAuthClient,
}));
vi.mock("@/lib/mcp/tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp/tokens")>()),
  hashOAuthRegistrationIp: mocks.hashOAuthRegistrationIp,
}));

import { POST } from "../route";

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("https://plutao.test/api/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", ...headers },
    body,
  });
}

describe("POST /api/oauth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashOAuthRegistrationIp.mockReturnValue("ip-hash");
    mocks.consumeOAuthRegistrationQuota.mockResolvedValue(true);
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = "https://client.example/callback";
  });

  afterEach(() => {
    delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
  });

  it("returns 429 with Retry-After when the per-IP quota is exhausted", async () => {
    mocks.consumeOAuthRegistrationQuota.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ redirect_uris: ["https://client.example/callback"] })));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.createOAuthClient).not.toHaveBeenCalled();
  });

  it("rejects a body larger than 16 KiB", async () => {
    const response = await POST(request(" ".repeat(16 * 1024 + 1)));

    expect(response.status).toBe(413);
    expect(mocks.createOAuthClient).not.toHaveBeenCalled();
  });

  it("creates a public client and returns its generated client_id", async () => {
    const response = await POST(request(JSON.stringify({
      client_name: "Test MCP Client",
      redirect_uris: ["https://client.example/callback"],
    })));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.client_id).toMatch(/^prt_client_/);
    expect(body.client_name).toBe("Test MCP Client");
    expect(mocks.createOAuthClient).toHaveBeenCalledOnce();
    expect(mocks.consumeOAuthRegistrationQuota).toHaveBeenCalledWith("ip-hash", 10);
  });

  it("deduplicates identical callback URIs and accepts loopback with a variable port", async () => {
    const callback = "http://127.0.0.1:43127/callback";
    const response = await POST(request(JSON.stringify({ redirect_uris: [callback, callback] })));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.redirect_uris).toEqual([callback]);
    expect(mocks.createOAuthClient).toHaveBeenCalledWith(expect.objectContaining({ redirectUris: [callback] }));
  });

  it("returns the exact escaped URI and reason for HTTPS outside the allowlist", async () => {
    const callback = "https://other.example/oauth/callback?state=a%20b";
    const response = await POST(request(JSON.stringify({ redirect_uris: [callback] })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "invalid_redirect_uri",
      reason: "https_uri_not_allowlisted",
      invalid_uri: callback,
    });
    expect(body.error_description).toContain(encodeURIComponent(callback));
    expect(mocks.createOAuthClient).not.toHaveBeenCalled();
  });

  it("rejects wildcard callbacks with a specific reason", async () => {
    const callback = "https://*.example.com/callback";
    const response = await POST(request(JSON.stringify({ redirect_uris: [callback] })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: "invalid_redirect_uri", reason: "wildcard_not_allowed", invalid_uri: callback });
  });
});
