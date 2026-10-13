/**
 * Elevated autonomy — reduces write-gate friction for trusted operators.
 *
 * Mode is stored in users.preferences.autonomyMode:
 *   - "standard" (default): every write creates GATE_PENDING
 *   - "elevated": capabilities in the allowlist auto-approve (audit gate still created)
 *
 * Destructive capabilities (delete, force-push, DROP, production deploys) are
 * never auto-approved regardless of mode.
 */

import { eq } from "drizzle-orm";
import { users } from "@plutao/db";
import { getDb } from "@/lib/db";

export type AutonomyMode = "standard" | "elevated";

/** Capabilities that may auto-approve under elevated mode (low-risk writes). */
export const ELEVATED_WRITE_ALLOWLIST = new Set<string>([
  // GitHub — non-destructive
  "github.branches.create",
  "github.files.write",
  "github.prs.create",
  // Notes / local filesystem (mission tools)
  "note.write",
  "filesystem.write",
  "filesystem.mkdir",
  // Telegram outbound (user's own bot)
  "telegram.send_message",
  // Export tools (local only)
  "files.export_pdf",
  "files.export_xlsx",
  "files.export_markdown",
  "files.export_html",
]);

/** Never auto-approve these even in elevated mode. */
export const ELEVATED_WRITE_DENYLIST = new Set<string>([
  "github.repos.delete",
  "supabase.sql_exec", // can contain DROP/TRUNCATE
  "cloudflare.dns_record_create",
  "cloudflare.pages_deploy",
  "render.deploy_trigger",
  "render.env_set",
  "vercel.deploy_create",
]);

export function isElevatedAutoApprove(capability: string, mode: AutonomyMode): boolean {
  if (mode !== "elevated") return false;
  if (ELEVATED_WRITE_DENYLIST.has(capability)) return false;
  // Also block anything that looks destructive by name
  const lower = capability.toLowerCase();
  if (/(delete|destroy|drop|truncate|force.?push|production)/.test(lower)) return false;
  return ELEVATED_WRITE_ALLOWLIST.has(capability);
}

export async function loadAutonomyMode(userId: string): Promise<AutonomyMode> {
  try {
    const rows = await getDb()
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const prefs = (rows[0]?.preferences ?? {}) as Record<string, unknown>;
    const mode = prefs.autonomyMode;
    if (mode === "elevated") return "elevated";
    return "standard";
  } catch {
    return "standard";
  }
}
