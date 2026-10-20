import { eq } from "drizzle-orm";
import { users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { resolveConfiguredCloudModelConfig, type ResolveCloudResult } from "./resolveConfig";

export type UserCloudModelResolution = ResolveCloudResult & {
  preferredModel: string | null;
};

/** Resolve the same effective model contract for a specific owned user. */
export async function resolveUserCloudModelConfig(userId: string): Promise<UserCloudModelResolution> {
  const rows = await getDb()
    .select({ preferredModel: users.preferredModel })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const preferredModel = rows[0]?.preferredModel?.trim() || null;
  return {
    ...resolveConfiguredCloudModelConfig(preferredModel),
    preferredModel,
  } as UserCloudModelResolution;
}
