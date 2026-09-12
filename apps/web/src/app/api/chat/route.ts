import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { agents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelMessage } from "@/lib/runtime/model/types";

export const runtime = "nodejs";

type ChatInputMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let history: ChatInputMessage[] = [];

    if (Array.isArray(body.messages)) {
      const rawList = body.messages.filter(
        (m: unknown): m is Record<string, unknown> => typeof m === "object" && m !== null
      );
      history = rawList
        .map(
          (m: Record<string, unknown>): ChatInputMessage => ({
            role: m.role === "assistant" || m.role === "system" ? (m.role as "assistant" | "system") : "user",
            content: String(m.content ?? "").trim(),
          })
        )
        .filter((m: ChatInputMessage) => m.content.length > 0);
    } else if (typeof body.message === "string" && body.message.trim().length > 0) {
      history = [{ role: "user", content: body.message.trim() }];
    }

    if (history.length === 0) {
      return NextResponse.json(
        { error: "Mensagem inválida ou vazia" },
        { status: 400 }
      );
    }

    // Carrega identidade do Agente do usuário
    let agentName = "Plutão";
    let agentIdentity = "Assistente pessoal autônomo do usuário";
    try {
      const db = getDb();
      const agentRows = await db
        .select({
          name: agents.name,
          identity: agents.identity,
          personality: agents.personality,
        })
        .from(agents)
        .where(eq(agents.userId, user.id))
        .limit(1);

      if (agentRows[0]) {
        if (agentRows[0].name) agentName = agentRows[0].name;
        if (agentRows[0].identity) agentIdentity = agentRows[0].identity;
      }
    } catch {
      /* fallback */
    }

    const systemPrompt = `Você é o ${agentName}, ${agentIdentity}.
Responda de forma clara, prestativa e objetiva ao usuário. Preserve um tom profissional e amigável.`;

    const modelConfig = getModelConfig();

    if (!modelConfig) {
      // Fallback amigável quando a API Key do modelo ainda não está configurada
      const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
      const userText = lastUserMsg?.content || "";
      const replyContent = `[${agentName}] Recebi sua mensagem: "${userText}". O ambiente atual não possui MODEL_API_KEY configurada. Configure a chave de API nas variáveis de ambiente para respostas inteligentes com LLM.`;

      return NextResponse.json({
        message: {
          role: "assistant",
          content: replyContent,
        },
        modelConfigured: false,
      });
    }

    const payloadMessages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const result = await chatCompletion(modelConfig, payloadMessages);

    return NextResponse.json({
      message: {
        role: "assistant",
        content: result.content,
      },
      modelConfigured: true,
      provider: result.provider,
      model: result.model,
    });
  } catch (e) {
    console.error("[chat POST]", e);
    const errorMsg = e instanceof Error ? e.message : "Falha ao processar mensagem";
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
