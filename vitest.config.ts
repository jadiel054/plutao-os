import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    globals: true,
    // Serializa arquivos de teste: os testes pg de integração compartilham um
    // único PostgreSQL (CI e local) e fazem bootstrap/TRUNCATE no mesmo schema;
    // em paralelo, o TRUNCATE CASCADE de um arquivo apaga dados de outro
    // (falhas intermitentes). Sem impacto de corretude — apenas ordem.
    fileParallelism: false,
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
