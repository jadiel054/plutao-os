import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1: no image optimization yet
  images: { unoptimized: true },

  // Monorepo workspace packages consumed by the app
  transpilePackages: ["@plutao/db", "@plutao/domain"],

  // Client-only TTS engines (dynamic import). Keep off the Node server bundle.
  serverExternalPackages: ["@realtimex/piper-tts-web", "kokoro-js", "exceljs"],

  // Piper WASM glue does require("fs") for the Node path; browser needs empty shim.
  // NÃO aliasar `path` — quebra path.normalize no prerender (ex. /404).
  turbopack: {
    resolveAlias: {
      fs: "./src/lib/voice/empty-shim.js",
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
        // microphone=(self) required for future ASR / getUserMedia; camera and geo stay blocked
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        // Report-only CSP: observe violations without breaking the app.
        // Allows blob/data/wasm/worker for on-device voice and local models;
        // connect-src covers same-origin APIs plus common model/voice hosts the app already uses.
        {
          key: "Content-Security-Policy-Report-Only",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https: wss: blob:",
            "media-src 'self' blob: data:",
            "worker-src 'self' blob:",
            "child-src 'self' blob:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
          : []),
      ],
    },
  ],

  // Build: warnings de ESLint não bloqueiam; errors (ex: no-explicit-any) ainda falham
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
