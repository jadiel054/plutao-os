/**
 * Agent autonomy levels — control write-gate friction.
 *
 * Stored in users.preferences.autonomyMode:
 *   - "standard" (default): every write creates GATE_PENDING (human must approve)
 *   - "elevated": allowlisted low-risk writes auto-approve (audit gate still created)
 *   - "full": ALL writes auto-approve except the hard denylist (delete/DROP/force-push/etc.)
 *
 * Destructive capabilities are never auto-approved in any mode.
 */

import { eq } from "drizzle-orm";
import { users } from "@plutao/db";
import { getDb } from "@/lib/db";

export type AutonomyMode = "standard" | "elevated" | "full";

/** Capabilities that may auto-approve under elevated mode (low-risk writes). */
export const ELEVATED_WRITE_ALLOWLIST = new Set<string>([
  "github.branches.create",
  "github.files.write",
  "github.prs.create",
  "note.write",
  "filesystem.write",
  "filesystem.mkdir",
  "telegram.send_message",
  "files.export_pdf",
  "files.export_xlsx",
  "files.export_markdown",
  "files.export_html",
]);

/** Never auto-approve these in any mode. */
export const AUTO_APPROVE_DENYLIST = new Set<string>([
  "github.repos.delete",
  "supabase.sql_exec",
  "cloudflare.dns_record_create",
  "cloudflare.pages_deploy",
  "render.deploy_trigger",
  "render.env_set",
  "vercel.deploy_create",
]);

/** @deprecated use AUTO_APPROVE_DENYLIST */
export const ELEVATED_WRITE_DENYLIST = AUTO_APPROVE_DENYLIST;

function isDestructiveCapability(capability: string): boolean {
  if (AUTO_APPROVE_DENYLIST.has(capability)) return true;
  const lower = capability.toLowerCase();
  return /(delete|destroy|drop|truncate|force.?push|production)/.test(lower);
}

/**
 * Whether this capability should skip the human write-gate card.
 * Gate rows are still created for audit; they are auto-approved + consumed.
 */
export function isAutoApproveCapable(capability: string, mode: AutonomyMode): boolean {
  if (mode === "standard") return false;
  if (isDestructiveCapability(capability)) return false;
  if (mode === "full") return true;
  // elevated
  return ELEVATED_WRITE_ALLOWLIST.has(capability);
}

/** @deprecated use isAutoApproveCapable */
export function isElevatedAutoApprove(capability: string, mode: AutonomyMode): boolean {
  return isAutoApproveCapable(capability, mode);
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
    if (mode === "full" || mode === "elevated" || mode === "standard") return mode;
    return "standard";
  } catch {
    return "standard";
  }
}

export function autonomyModeLabel(mode: AutonomyMode): string {
  switch (mode) {
    case "full":
      return "Total (auto-aprova escritas)";
    case "elevated":
      return "Elevada (allowlist)";
    default:
      return "Padrão (aprovação humana)";
  }
}
