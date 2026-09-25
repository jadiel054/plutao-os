import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  transpilePackages: ["@plutao/db", "@plutao/domain"],
  serverExternalPackages: [
    "@realtimex/piper-tts-web",
    "kokoro-js",
    "onnxruntime-web",
  ],
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
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
