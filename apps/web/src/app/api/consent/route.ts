import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { consentRecords } from "@plutao/db";
import { getDb } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth/session";
import { CONSENT_POLICY_VERSION, EMPTY_CONSENTS, isConsentScope, type ConsentState } from "@/lib/consent";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await getDb()
      .select({ scope: consentRecords.scope, granted: consentRecords.granted, createdAt: consentRecords.createdAt })
      .from(consentRecords)
      .where(eq(consentRecords.userId, user.id))
      .orderBy(desc(consentRecords.createdAt));
    const state: ConsentState = { ...EMPTY_CONSENTS };
    // A record is append-only; the newest record wins, including explicit false.
    const seen = new Set<string>();
    for (const row of rows) {
      if (isConsentScope(row.scope) && !seen.has(row.scope)) {
        state[row.scope] = row.granted;
        seen.add(row.scope);
      }
    }
    return NextResponse.json({ consents: state, policyVersion: CONSENT_POLICY_VERSION });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    console.error("[GET /api/consent]", error);
    return NextResponse.json({ error: "Falha ao ler consentimentos" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const scope = body?.scope;
    const granted = body?.granted;
    if (!isConsentScope(scope) || typeof granted !== "boolean") {
      return NextResponse.json({ error: "Consentimento inválido" }, { status: 400 });
    }
    await getDb().insert(consentRecords).values({
      userId: user.id,
      scope,
      policyVersion: CONSENT_POLICY_VERSION,
      granted,
    });
    return NextResponse.json({ ok: true, scope, granted, policyVersion: CONSENT_POLICY_VERSION });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    console.error("[PATCH /api/consent]", error);
    return NextResponse.json({ error: "Falha ao salvar consentimento" }, { status: 500 });
  }
}
