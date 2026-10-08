import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { LookupFunction } from "node:net";
import { findOAuthClient } from "./grants";
import {
  DYNAMIC_OAUTH_CLIENT_ID_PREFIX,
  type OAuthClientMetadata,
  type RedirectUriProblem,
} from "./clientRegistration";
import { validateRedirectUri } from "./tokens";

const MAX_METADATA_BYTES = 32 * 1024;
const METADATA_TIMEOUT_MS = 5_000;
const MAX_CLIENT_NAME_LENGTH = 128;
const MAX_REDIRECT_URIS = 32;
const MAX_METADATA_CACHE_ENTRIES = 256;
const MAX_METADATA_CACHE_AGE_SEC = 60 * 60;
type ResolvedAddress = { address: string; family: number };
const metadataCache = new Map<string, { document: unknown; expiresAt: number }>();

export type ResolvedMcpOAuthClient = OAuthClientMetadata & {
  clientId: string;
  source: "cimd" | "dynamic" | "legacy";
  clientOrigin?: string;
};

export type OAuthClientResolution =
  | { ok: true; client: ResolvedMcpOAuthClient }
  | { ok: false; error: "invalid_client" | "invalid_client_metadata" | "invalid_redirect_uri"; description: string; redirectUri?: string; reason?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

function ipv4IsPublic(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
  if (a === 198 && ((b === 18) || (b === 19) || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6IsPublic(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (!normalized || normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("::ffff:") || normalized.startsWith("2002:") || normalized.startsWith("2001:0:")) return false;
  const first = Number.parseInt(normalized.split(":").filter(Boolean)[0] || "0", 16);
  // Global unicast 2000::/3 only; reject unique-local, link-local, multicast and reserved ranges.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  return true;
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? ipv4IsPublic(address) : family === 6 ? ipv6IsPublic(address) : false;
}

function clientIdDocumentUrl(clientId: string): URL | null {
  try {
    const url = new URL(clientId);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.pathname === "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      clientId.includes("*")
    ) return null;
    for (const segment of url.pathname.split("/")) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return null;
      }
      if (decoded === "." || decoded === "..") return null;
    }
    return url;
  } catch {
    return null;
  }
}

function cacheMaxAgeSeconds(headers: import("node:http").IncomingHttpHeaders): number {
  const rawCacheControl = headers["cache-control"];
  const cacheControl = (Array.isArray(rawCacheControl) ? rawCacheControl.join(",") : rawCacheControl || "").toLowerCase();
  if (/\b(?:no-store|no-cache|private)\b/.test(cacheControl)) return 0;
  const maxAge = /(?:s-maxage|max-age)\s*=\s*"?(\d+)"?/.exec(cacheControl);
  if (maxAge) {
    const age = Number(headers.age || 0);
    return Math.max(0, Math.min(MAX_METADATA_CACHE_AGE_SEC, Number(maxAge[1]) - (Number.isFinite(age) ? age : 0)));
  }
  const expires = Date.parse(String(headers.expires || ""));
  if (Number.isFinite(expires)) return Math.max(0, Math.min(MAX_METADATA_CACHE_AGE_SEC, Math.floor((expires - Date.now()) / 1000)));
  return 60;
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const bareHost = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(bareHost);
  if (literalFamily) {
    if (!isPublicAddress(bareHost)) throw new Error("unsafe metadata host");
    return { address: bareHost, family: literalFamily };
  }
  const addresses = await lookup(bareHost, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("unsafe metadata host");
  }
  return addresses[0];
}

function resolveAddressWithTimeout(hostname: string): Promise<ResolvedAddress> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("metadata DNS timeout")), METADATA_TIMEOUT_MS);
    void resolvePublicAddress(hostname).then(
      (address) => { clearTimeout(timer); resolve(address); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function fetchMetadata(url: URL, clientId: string): Promise<unknown> {
  const cacheKey = clientId;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.document);
  if (cached) metadataCache.delete(cacheKey);

  return new Promise((resolve, reject) => {
    void resolveAddressWithTimeout(url.hostname).then((address) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const finish = (value: unknown) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const pinnedLookup = ((
        _hostname: string,
        options: unknown,
        callback: (...args: unknown[]) => void,
      ) => {
        if (typeof options === "object" && options !== null && "all" in options && options.all === true) {
          callback(null, [address]);
        } else {
          callback(null, address.address, address.family);
        }
      }) as LookupFunction;
      const requestOptions: RequestOptions = {
        protocol: "https:",
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { Accept: "application/json, application/*+json" },
        lookup: pinnedLookup,
        ...(isIP(url.hostname.replace(/^\[|\]$/g, "")) ? {} : { servername: url.hostname }),
      };
      const req = httpsRequest(requestOptions, (res) => {
        const contentType = (res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        const isJson = contentType === "application/json" || (contentType.startsWith("application/") && contentType.endsWith("+json"));
        if (res.statusCode !== 200 || !isJson) {
          res.resume();
          fail(new Error("metadata document response rejected"));
          return;
        }
        const declaredLength = Number(res.headers["content-length"] || 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_METADATA_BYTES) {
          res.destroy();
          fail(new Error("metadata document too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        res.on("data", (chunk: Buffer | string) => {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += part.byteLength;
          if (totalBytes > MAX_METADATA_BYTES) {
            res.destroy();
            fail(new Error("metadata document too large"));
            return;
          }
          chunks.push(part);
        });
        res.on("end", () => {
          try {
            const document = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
            const maxAge = cacheMaxAgeSeconds(res.headers);
            const validMetadata = parseClientMetadataDocument(clientId, document).ok;
            if (validMetadata && maxAge > 0) {
              if (metadataCache.has(cacheKey)) metadataCache.delete(cacheKey);
              if (metadataCache.size >= MAX_METADATA_CACHE_ENTRIES) {
                const oldestKey = metadataCache.keys().next().value;
                if (oldestKey) metadataCache.delete(oldestKey);
              }
              metadataCache.set(cacheKey, { document, expiresAt: Date.now() + maxAge * 1000 });
            }
            finish(document);
          } catch {
            fail(new Error("metadata document is not valid JSON"));
          }
        });
        res.on("error", () => fail(new Error("metadata document response failed")));
      });
      req.setTimeout(METADATA_TIMEOUT_MS, () => req.destroy(new Error("metadata document timeout")));
      const hardTimeout = setTimeout(() => req.destroy(new Error("metadata document total timeout")), METADATA_TIMEOUT_MS);
      req.on("close", () => clearTimeout(hardTimeout));
      req.on("error", () => fail(new Error("metadata document fetch failed")));
      req.end();
    }).catch(() => reject(new Error("metadata document host rejected")));
  });
}

function invalidMetadata(description: string): OAuthClientResolution {
  return { ok: false, error: "invalid_client_metadata", description };
}

export function parseClientMetadataDocument(clientId: string, document: unknown): OAuthClientResolution {
  const clientUrl = clientIdDocumentUrl(clientId);
  if (!clientUrl) return { ok: false, error: "invalid_client", description: "client_id deve ser uma URL HTTPS pública com caminho, sem query, fragmento ou credenciais." };
  if (!isRecord(document) || document.client_id !== clientId) {
    return invalidMetadata("client_id do documento deve corresponder exatamente à URL usada como client_id.");
  }
  if (typeof document.client_name !== "string" || !document.client_name.trim() || document.client_name.length > MAX_CLIENT_NAME_LENGTH) {
    return invalidMetadata("client_name deve ser uma string não vazia de até 128 caracteres.");
  }
  if ("client_secret" in document || "client_secret_expires_at" in document) {
    return invalidMetadata("Documentos CIMD não podem conter credenciais simétricas.");
  }
  const authMethod = document.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") return invalidMetadata("Somente clientes públicos com token_endpoint_auth_method=none são aceitos.");

  const rawRedirectUris = readStringArray(document.redirect_uris);
  if (!rawRedirectUris) return invalidMetadata("redirect_uris deve conter ao menos uma URI string.");
  const redirectUris = [...new Set(rawRedirectUris)];
  if (redirectUris.length > MAX_REDIRECT_URIS) return invalidMetadata("redirect_uris excede o limite de 32 callbacks únicos.");
  for (const redirectUri of redirectUris) {
    const valid = validateRedirectUri(redirectUri, { sameOriginAs: clientUrl.origin });
    if (!valid.ok) {
      return {
        ok: false,
        error: "invalid_redirect_uri",
        reason: valid.reason,
        redirectUri,
        description: `redirect_uri recusada (${valid.reason}): ${encodeURIComponent(redirectUri)}`,
      };
    }
  }

  const rawGrantTypes = document.grant_types === undefined ? ["authorization_code"] : readStringArray(document.grant_types);
  if (!rawGrantTypes || !rawGrantTypes.includes("authorization_code") || rawGrantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) {
    return invalidMetadata("grant_types deve incluir authorization_code e pode incluir refresh_token.");
  }
  const rawResponseTypes = document.response_types === undefined ? ["code"] : readStringArray(document.response_types);
  if (!rawResponseTypes || rawResponseTypes.length !== 1 || rawResponseTypes[0] !== "code") {
    return invalidMetadata("Somente response_types=[code] é aceito.");
  }

  const metadata: OAuthClientMetadata = {
    clientName: document.client_name.trim(),
    redirectUris,
    grantTypes: rawGrantTypes,
    responseTypes: rawResponseTypes,
    tokenEndpointAuthMethod: "none",
  };
  return {
    ok: true,
    client: { clientId, source: "cimd", clientOrigin: clientUrl.origin, ...metadata },
  };
}

export async function resolveMcpOAuthClient(clientId: string): Promise<OAuthClientResolution> {
  if (clientId.startsWith("https://")) {
    const url = clientIdDocumentUrl(clientId);
    if (!url) return { ok: false, error: "invalid_client", description: "client_id CIMD precisa ser uma URL HTTPS válida com caminho." };
    try {
      const document = await fetchMetadata(url, clientId);
      return parseClientMetadataDocument(clientId, document);
    } catch {
      return { ok: false, error: "invalid_client", description: "Não foi possível validar com segurança o documento client_id do cliente MCP." };
    }
  }

  const registered = await findOAuthClient(clientId);
  if (registered) {
    return {
      ok: true,
      client: {
        clientId,
        source: "dynamic",
        clientName: registered.clientName || null,
        redirectUris: Array.isArray(registered.redirectUris) ? registered.redirectUris : [],
        grantTypes: Array.isArray(registered.grantTypes) ? registered.grantTypes : ["authorization_code"],
        responseTypes: Array.isArray(registered.responseTypes) ? registered.responseTypes : ["code"],
        tokenEndpointAuthMethod: "none",
      },
    };
  }
  if (clientId.startsWith(DYNAMIC_OAUTH_CLIENT_ID_PREFIX)) {
    return { ok: false, error: "invalid_client", description: "client_id dinâmico não registrado ou indisponível." };
  }
  return {
    ok: true,
    client: {
      clientId,
      source: "legacy",
      clientName: null,
      redirectUris: [],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
    },
  };
}

export function validateClientRedirectUri(client: ResolvedMcpOAuthClient, redirectUri: string): RedirectUriProblem | { ok: true } {
  const validation = validateRedirectUri(redirectUri, client.source === "cimd" ? { sameOriginAs: client.clientOrigin } : undefined);
  if (!validation.ok) return { ok: false, error: "invalid_redirect_uri", reason: validation.reason, redirectUri };
  if ((client.source === "dynamic" || client.source === "cimd") && !client.redirectUris.includes(redirectUri)) {
    return { ok: false, error: "invalid_redirect_uri", reason: "not_registered_for_client", redirectUri };
  }
  return { ok: true };
}

export function clientSupportsGrant(client: ResolvedMcpOAuthClient, grantType: string): boolean {
  return client.grantTypes.includes(grantType);
}
