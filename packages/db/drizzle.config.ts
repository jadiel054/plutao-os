import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — Plutão
 * Use DATABASE_URL_UNPOOLED (direct) for migrations, never the pooled URL.
 * See Neon skill / docs for pooled vs direct.
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
  verbose: true,
  strict: true,
});
