import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1: no image optimization yet
  images: { unoptimized: true },

  // Monorepo workspace packages consumed by the app
  transpilePackages: ["@plutao/db", "@plutao/domain"],

  // Client-only TTS engines (dynamic import). Keep off the Node server bundle.
  serverExternalPackages: ["@realtimex/piper-tts-web", "kokoro-js"],

  // Piper WASM glue does require("fs") / require("path") for the Node path;
  // in the browser those must resolve to an empty shim (Turbopack + webpack).
  turbopack: {
    resolveAlias: {
      fs: "./src/lib/voice/empty-shim.js",
      path: "./src/lib/voice/empty-shim.js",
    },
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },

  // PWA: Service Worker in public/sw.js enables transparent updates
  // (skipWaiting + clients.claim) so Vercel deploys apply without reinstall.
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],

  // Build: warnings de ESLint não bloqueiam; errors (ex: no-explicit-any) ainda falham
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
