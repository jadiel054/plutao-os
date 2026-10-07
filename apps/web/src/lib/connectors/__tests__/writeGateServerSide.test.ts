/**
 * H1 — Write Gate validado no servidor.
 *
 * Antes: os executores aceitavam `_gateApproved === true` vindo do INPUT do modelo,
 * sem validar `_gateId`. Qualquer payload com esse booleano executava a escrita real.
 *
 * Estes testes cobrem exatamente os cenários exigidos:
 *   sem id · id de outro usuário · payload alterado · replay · gate pending · gate rejected
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dbSchema from "@plutao/db";

type Row = Record<string, unknown>;

const store: Row[] = [];
let seq = 0;

/** Mapa coluna drizzle → chave JS, para o fake avaliar `eq()` por identidade. */
const colToKey = new Map<unknown, string>();
const gateColumns = dbSchema.writeGates as unknown as Record<string, unknown>;
for (const [key, col] of Object.entries(gateColumns)) {
  colToKey.set(col, key);
}

type Cond = { __op: "eq"; key: string; val: unknown } | { __op: "and"; conds: Cond[] };

function matches(row: Row, cond: Cond): boolean {
  if (cond.__op === "and") return cond.conds.every((c) => matches(row, c));
  return row[cond.key] === cond.val;
}

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ __op: "eq", key: colToKey.get(col), val }),
    and: (...conds: Cond[]) => ({ __op: "and", conds }),
    desc: (col: unknown) => col,
  };
});

vi.mock("@plutao/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createDb: () => ({
      select: () => ({
        from: () => ({
          where: (cond: Cond) => ({
            limit: async (n: number) => store.filter((r) => matches(r, cond)).slice(0, n),
          }),
          limit: async (n: number) => store.slice(0, n),
        }),
      }),
      insert: () => ({
        values: (v: Row) => ({
          returning: async () => {
            const row = { ...v, id: v.id ?? `gate-${++seq}` };
            store.push(row);
            return [row];
          },
        }),
      }),
      update: () => ({
        set: (patch: Row) => ({
          where: (cond: Cond) => ({
            returning: async () => {
              const hit = store.filter((r) => matches(r, cond));
              hit.forEach((r) => Object.assign(r, patch));
              return hit;
            },
          }),
        }),
      }),
    }),
  };
});

import { computeGatePayloadHash } from "../gatePayload";
import {
  approveGate,
  consumeGateForWrite,
  createWriteGate,
  markGateRejected,
} from "../gates";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const PAYLOAD = { repo: "jadiel054/plutao-os", path: "README.md", content: "conteudo" };

async function makeGate(userId = USER_A) {
  const gate = await createWriteGate({
    userId,
    missionId: null,
    provider: "github",
    capability: "repo_create",
    target: "jadiel054/plutao-smoke",
    summary: "criar repositório",
    payload: PAYLOAD,
    contentPreview: null,
  });
  return gate;
}

function hashOf(payload: Record<string, unknown> = PAYLOAD) {
  return computeGatePayloadHash("github", "repo_create", payload);
}

describe("H1 — write gate validado no servidor", () => {
  beforeEach(() => {
    store.length = 0;
    seq = 0;
  });

  it("sem id: gate inexistente não autoriza escrita", async () => {
    const res = await consumeGateForWrite({
      gateId: "00000000-0000-4000-8000-000000000000",
      userId: USER_A,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATE_NOT_FOUND");
  });

  it("id de outro usuário: recusa (gate não é do usuário)", async () => {
    const gate = await makeGate(USER_A);
    await approveGate(gate.id, USER_A);

    const res = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_B,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATE_NOT_FOUND");
  });

  it("payload alterado: hash divergente recusa", async () => {
    const gate = await makeGate(USER_A);
    await approveGate(gate.id, USER_A);

    const res = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf({ ...PAYLOAD, content: "conteudo MALICIOSO" }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATE_PAYLOAD_MISMATCH");
  });

  it("replay: o segundo consumo do mesmo gate é recusado (uso único)", async () => {
    const gate = await makeGate(USER_A);
    await approveGate(gate.id, USER_A);

    const first = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(first.ok).toBe(true);

    const second = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("GATE_NOT_APPROVED");
  });

  it("gate pending: nunca autoriza (só `approved` executa)", async () => {
    const gate = await makeGate(USER_A);

    const res = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATE_NOT_APPROVED");
  });

  it("gate rejected: nunca autoriza", async () => {
    const gate = await makeGate(USER_A);
    await markGateRejected(gate.id, USER_A);

    const res = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "github",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATE_NOT_APPROVED");
  });

  it("provider/capability diferentes não autorizam a escrita pedida", async () => {
    const gate = await makeGate(USER_A);
    await approveGate(gate.id, USER_A);

    const wrongProvider = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "vercel",
      capability: "repo_create",
      payloadHash: hashOf(),
    });
    expect(wrongProvider.ok).toBe(false);
    if (!wrongProvider.ok) expect(wrongProvider.code).toBe("GATE_PROVIDER_MISMATCH");

    const wrongCapability = await consumeGateForWrite({
      gateId: gate.id,
      userId: USER_A,
      provider: "github",
      capability: "push_files",
      payloadHash: hashOf(),
    });
    expect(wrongCapability.ok).toBe(false);
    if (!wrongCapability.ok) expect(wrongCapability.code).toBe("GATE_CAPABILITY_MISMATCH");
  });

  it("o hash aprovado é o do payload persistido (não o do cliente)", async () => {
    const gate = await makeGate(USER_A);
    expect(gate.payloadHash).toBe(hashOf());

    const approved = await approveGate(gate.id, USER_A);
    expect(approved?.payloadHash).toBe(hashOf());
    expect(approved?.status).toBe("approved");
  });
});
