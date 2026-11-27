import { NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import {
  buildCurrentInventory,
  lastSnapshot,
  saveSnapshot,
  snapshotsAvailable,
} from "@/lib/agentic/capability-snapshot";

export const dynamic = "force-dynamic";

/**
 * Descoberta permanente de capacidades do próprio Plutão.
 * GET: inventário atual + diff contra o último snapshot + plano de estudo.
 * POST: salva um novo snapshot (com diff). Degrada graciosamente sem a
 * tabela (migration 0033 pendente). Descobrir NÃO concede autorização.
 */
function diffInventories(
  current: { capabilities: Array<{ id: string }>; surfaces: Array<{ pageId: string }> },
  previous: { capabilities: Array<{ id: string }>; surfaces: Array<{ pageId: string }> } | null
) {
  if (!previous) return { added: current.capabilities.length, removed: 0, unchanged: 0, firstSnapshot: true };
  const prevCapIds = new Set(previous.capabilities.map((c) => c.id));
  const curCapIds = new Set(current.capabilities.map((c) => c.id));
  const prevSurf = new Set(previous.surfaces.map((s) => s.pageId));
  const curSurf = new Set(current.surfaces.map((s) => s.pageId));
  let added = 0;
  let removed = 0;
  for (const id of curCapIds) if (!prevCapIds.has(id)) added++;
  for (const id of prevCapIds) if (!curCapIds.has(id)) removed++;
  let surfaceChanges = 0;
  for (const id of curSurf) if (!prevSurf.has(id)) surfaceChanges++;
  for (const id of prevSurf) if (!curSurf.has(id)) surfaceChanges++;
  return {
    added,
    removed,
    surfaceChanges,
    unchanged: current.capabilities.length - added,
    firstSnapshot: false,
  };
}

export async function GET() {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const inventory = await buildCurrentInventory(user.id);
    const previous = await lastSnapshot(user.id);
    const diff = diffInventories(inventory, previous ? previous.inventory : null);
    const studyPlan = inventory.capabilities
      .filter((c) => c.source === "learned")
      .slice(0, 10)
      .map((c) => ({ id: c.id, action: "revisar contrato e limitações registradas" }));
    return NextResponse.json({
      available: true,
      snapshotsAvailable: await snapshotsAvailable(),
      capabilityCount: inventory.capabilities.length,
      surfaceCount: inventory.surfaces.length,
      generatedAt: inventory.generatedAt,
      diff,
      studyPlan,
      inventory,
      lastSnapshotAt: previous ? previous.createdAt : null,
    });
  } catch (e) {
    return NextResponse.json(
      { available: false, error: e instanceof Error ? e.message : "erro ao inventariar capacidades" },
      { status: 200 }
    );
  }
}

export async function POST() {
  const user = await getAuthOrGuestUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const inventory = await buildCurrentInventory(user.id);
    const previous = await lastSnapshot(user.id);
    const diff = diffInventories(inventory, previous ? previous.inventory : null);
    const saved = await saveSnapshot(user.id, inventory, diff);
    return NextResponse.json({
      saved,
      diff,
      capabilityCount: inventory.capabilities.length,
      surfaceCount: inventory.surfaces.length,
      generatedAt: inventory.generatedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { saved: { stored: false, reason: e instanceof Error ? e.message : "erro" } },
      { status: 200 }
    );
  }
}
