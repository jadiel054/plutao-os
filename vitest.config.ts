import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/vendor/**", "apps/android/native/cpp/vendor/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/web/src"),
    },
  },
});
