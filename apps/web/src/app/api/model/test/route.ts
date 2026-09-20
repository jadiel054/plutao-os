import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users, usageCounters } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { getPlanDefinition, PRESET_MODELS } from "@plutao/domain";
import { getModelConfig } from "@/lib/runtime/model/config";
import { resolveCloudModelConfig, isLocalCatalogModel } from "@/lib/runtime/model/resolveConfig";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig } from "@/lib/runtime/model/types";

export const runtime = "nodejs";

async function incrementUsage(db: ReturnType<typeof getDb>, userId: string, isPremium: boolean) {
  const todayStr = new Date().toISOString().split("T")[0];
  try {
    const existing = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, todayStr)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(usageCounters)
        .set({
          messages: existing[0].messages + 1,
          premiumMessages: isPremium ? existing[0].premiumMessages + 1 : existing[0].premiumMessages,
        })
        .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, todayStr)));
    } else {
      await db.insert(usageCounters).values({
        userId,
        day: todayStr,
        messages: 1,
        premiumMessages: isPremium ? 1 : 0,
      });
    }
  } catch (err) {
    console.error("[model/test incrementUsage error]", err);
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    const prompt = typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : "Explique o sistema Plutão em 2 frases curtas.";

    if (!modelId) {
      return NextResponse.json({ error: "Modelo não especificado" }, { status: 400 });
    }

    const db = getDb();
    const userRows = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const planDef = getPlanDefinition(userRows[0]?.plan);

    // Query today's usage
    const todayStr = new Date().toISOString().split("T")[0];
    const usageRows = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, user.id), eq(usageCounters.day, todayStr)))
      .limit(1);

    const currentUsage = usageRows[0] ?? { messages: 0, premiumMessages: 0 };

    const matchedModel = PRESET_MODELS.find((m) => m.id === modelId);
    const isPremium = matchedModel?.tier === "premium";

    // Rate limits check
    if (planDef.cloudMessagesPerDay !== null && currentUsage.messages >= planDef.cloudMessagesPerDay) {
      return NextResponse.json(
        {
          limit: true,
          error: `Sua sonda atingiu o limite da ${planDef.label} (${planDef.cloudMessagesPerDay} mensagens em nuvem hoje).`,
        },
        { status: 429 }
      );
    }

    if (isPremium && !planDef.models.includes("premium")) {
      return NextResponse.json(
        {
          error: `O modelo ${matchedModel?.name || modelId} é exclusivo do plano Caronte (Pro) ou superior.`,
        },
        { status: 403 }
      );
    }

    if (isPremium && planDef.premiumPerDay !== null && currentUsage.premiumMessages >= planDef.premiumPerDay) {
      return NextResponse.json(
        {
          limit: true,
          error: `Sua cota diária de modelos premium (${planDef.premiumPerDay} msgs) foi atingida.`,
        },
        { status: 429 }
      );
    }

    // Resolve model config for test call (id de catálogo ≠ nome na API)
    let config: ModelConfig | null = null;

    if (isLocalCatalogModel(modelId)) {
      return NextResponse.json({
        output: `[${matchedModel?.name || modelId}] Modelo local (WebGPU/navegador). Teste de nuvem não se aplica.`,
        latencyMs: 0,
        tokensGenerated: 0,
        error: "LOCAL_MODEL",
      });
    }

    const resolved = resolveCloudModelConfig(modelId);
    if (resolved.ok) {
      config = resolved.config;
    } else {
      // Fallback: config global do servidor (MODEL_*)
      config = getModelConfig();
      if (!config) {
        return NextResponse.json({
          output: `[${matchedModel?.name || modelId}] ${resolved.error}`,
          latencyMs: 0,
          tokensGenerated: 0,
          error: resolved.error,
          missingEnv: resolved.missingEnv,
        });
      }
      console.warn("[model/test] rota específica falhou, usando getModelConfig:", resolved.error);
    }

    const startTime = performance.now();
    let responseText = "";

    try {
      const res = await chatCompletion(config, [
        { role: "system", content: "Responda de forma concisa e direta ao teste de conexão de modelo." },
        { role: "user", content: prompt },
      ]);
      responseText = res.content;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      const errMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        output: `[${matchedModel?.name || modelId}] Sem saldo ou resposta do provedor: ${errMsg}`,
        latencyMs,
        tokensGenerated: 0,
        error: errMsg,
      });
    }

    const latencyMs = Math.round(performance.now() - startTime);
    await incrementUsage(db, user.id, isPremium);

    return NextResponse.json({
      output: responseText,
      latencyMs,
      tokensGenerated: Math.round(responseText.length / 4),
    });
  } catch (err) {
    console.error("[POST /api/model/test]", err);
    return NextResponse.json({ error: "Erro ao testar modelo." }, { status: 500 });
  }
}
