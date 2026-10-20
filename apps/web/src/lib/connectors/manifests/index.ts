import type { ConnectorProviderId } from "@plutao/domain";
import type { ConnectorManifest } from "./types";
import { githubManifest } from "./github";
import { vercelManifest } from "./vercel";
import { neonManifest } from "./neon";
import { stripeManifest } from "./stripe";
import { supabaseManifest } from "./supabase";
import { telegramManifest } from "./telegram";
import { cloudflareManifest } from "./cloudflare";
import { renderManifest } from "./render";
import { artemisManifest } from "./artemis";
import { maestroManifest, appiumManifest, playwrightManifest, androidworldManifest } from "./automation";

export * from "./types";
export { githubManifest } from "./github";
export { vercelManifest } from "./vercel";
export { neonManifest } from "./neon";
export { stripeManifest } from "./stripe";
export { supabaseManifest } from "./supabase";
export { telegramManifest } from "./telegram";
export { cloudflareManifest } from "./cloudflare";
export { renderManifest } from "./render";
export { artemisManifest } from "./artemis";
export { maestroManifest, appiumManifest, playwrightManifest, androidworldManifest } from "./automation";

export const CONNECTOR_MANIFESTS: Record<ConnectorProviderId, ConnectorManifest> = {
  github: githubManifest,
  vercel: vercelManifest,
  neon: neonManifest,
  stripe: stripeManifest,
  supabase: supabaseManifest,
  telegram: telegramManifest,
  cloudflare: cloudflareManifest,
  render: renderManifest,
  artemis: artemisManifest,
  maestro: maestroManifest,
  appium: appiumManifest,
  playwright: playwrightManifest,
  androidworld: androidworldManifest,
};

export function getConnectorManifest(provider: string): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS[provider as ConnectorProviderId];
}

export function getAllConnectorManifests(): ConnectorManifest[] {
  return Object.values(CONNECTOR_MANIFESTS);
}
