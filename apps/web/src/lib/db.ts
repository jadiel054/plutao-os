import { createDb, type Db } from "@plutao/db";

/** Per-request / cold-start safe client (Neon HTTP). */
export function getDb(): Db {
  return createDb();
}
