import type { ConnectorProviderId } from "@plutao/domain";
import type { ConnectorManifest } from "./types";
import { githubManifest } from "./github";
import { vercelManifest } from "./vercel";
import { neonManifest } from "./neon";
import { stripeManifest } from "./stripe";

export * from "./types";
export { githubManifest } from "./github";
export { vercelManifest } from "./vercel";
export { neonManifest } from "./neon";
export { stripeManifest } from "./stripe";

export const CONNECTOR_MANIFESTS: Record<ConnectorProviderId, ConnectorManifest> = {
  github: githubManifest,
  vercel: vercelManifest,
  neon: neonManifest,
  stripe: stripeManifest,
};

export function getConnectorManifest(provider: string): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS[provider as ConnectorProviderId];
}

export function getAllConnectorManifests(): ConnectorManifest[] {
  return Object.values(CONNECTOR_MANIFESTS);
}
