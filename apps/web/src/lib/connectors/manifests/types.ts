import type { ConnectorProviderId } from "@plutao/domain";

export type ConnectorCategory = "desenvolvedores" | "finanças" | string;

export type CapabilityManifest = {
  name: string;
  description: string;
  mode: "read" | "write";
  request: {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string; // e.g. "/user/repos" or "/repos/{owner}/{repo}/issues"
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  requiredArgs?: string[];
  summary?: {
    pick?: string[];
    limit?: number;
    customFormatter?: (data: unknown) => string;
  };
  intentKeywords?: string[];
};

export type OAuthManifestConfig = {
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  authorizeParams?: (redirectUri: string, state: string, scopes: string[]) => Record<string, string>;
  tokenUrl: string;
  tokenFormat: "json" | "urlencoded";
  userinfoUrl: string;
  userinfoHeaders?: (accessToken: string) => Record<string, string>;
  extractUserLogin: (data: unknown) => string;
  extractAccessToken?: (data: unknown) => string;
};

export type TokenManifestConfig = {
  url?: string;
  label?: string;
  placeholder?: string;
  verifyUrl: string;
  verifyHeaders?: (token: string) => Record<string, string>;
  extractUserLogin: (data: unknown) => string;
};

export type ConnectorManifest = {
  provider: ConnectorProviderId;
  displayName: string;
  description: string;
  category: ConnectorCategory;
  featured?: boolean;
  authMode: "oauth" | "token";
  baseUrl: string;
  headers?: (token: string) => Record<string, string>;
  oauth?: OAuthManifestConfig;
  tokenConfig?: TokenManifestConfig;
  capabilities: CapabilityManifest[];
  defaultScopes?: string[];
  defaultServerUrl?: string;
};
