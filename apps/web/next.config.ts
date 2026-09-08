import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1: no image optimization yet
  images: { unoptimized: true },
  // Prepare for PWA and transparent updates
  // Service Worker strategy will be added (Serwist or manual) so that
  // Vercel deployments are applied without requiring PWA reinstall.
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
  ],
};

export default nextConfig;
