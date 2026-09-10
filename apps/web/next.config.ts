import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1: no image optimization yet
  images: { unoptimized: true },

  // Monorepo workspace packages consumed by the app
  transpilePackages: ["@plutao/db", "@plutao/domain"],

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
};

export default nextConfig;
