import type { ConnectorManifest } from "./types";

/** Internal server capability; ARTEMIS is configured by deployment secrets, not by end users. */
export const artemisManifest: ConnectorManifest = {
  provider: "artemis",
  displayName: "ARTEMIS Mobile",
  description: "Executor Android assíncrono via GitHub Actions, Tailscale e ADB.",
  category: "mobile",
  featured: false,
  authMode: "internal",
  runtimeOnly: true,
  baseUrl: "https://api.github.com",
  capabilities: [
    {
      name: "device_execute",
      description: "Executar uma instrução de automação Android em um device autorizado.",
      mode: "write",
      request: { method: "POST", path: "/internal/artemis/device-execute" },
      requiredArgs: ["prompt", "nonce"],
    },
  ],
};
