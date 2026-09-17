import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { formatFileSize } from "@/lib/artifacts";
import { getSessionUser } from "@/lib/auth/session";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelMessage } from "@/lib/runtime/model/types";
import { extractSuggestedPlan } from "@/lib/missions/extractPlan";

export const runtime = "nodejs";

type ChatInputMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOTAL_HISTORY_LENGTH = 16000;

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
        .map((m: Record<string, unknown>): ChatInputMessage | null => {
          if (m.role !== "user" && m.role !== "assistant") return null;
          const content = String(m.content ?? "").trim();
          if (!content) return null;
          return { role: m.role, content };
        })
        .filter((m: ChatInputMessage | null): m is ChatInputMessage => m !== null);
    } else if (typeof body.message === "string" && body.message.trim().length > 0) {
      history = [{ role: "user", content: body.message.trim() }];
    }

    if (history.length === 0) {
      return NextResponse.json({ error: "Mensagem inválida ou vazia" }, { status: 400 });
    }

    for (const msg of history) {
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: "Mensagem excede o limite permitido (máximo 4000 caracteres)" },
          { status: 400 }
        );
      }
    }

    const totalHistoryLength = history.reduce((sum, m) => sum + m.content.length, 0);
    if (totalHistoryLength > MAX_TOTAL_HISTORY_LENGTH) {
      return NextResponse.json(
        { error: "Histórico excede o limite total permitido" },
        { status: 400 }
      );
    }

    const missionId =
      typeof body.missionId === "string" && body.missionId.trim()
        ? body.missionId.trim()
        : null;

    const db = getDb();
    let rawArtifactIds: string[] = [];
    if (Array.isArray(body.artifactIds)) {
      rawArtifactIds = body.artifactIds.filter(
        (id: unknown): id is string => typeof id === "string" && id.trim().length > 0
      );
    }

    type AttachedArtifactMeta = {
      id: string;
      name: string;
      type: string;
      size: number;
      content: string;
    };
    let validatedArtifacts: AttachedArtifactMeta[] = [];

    if (rawArtifactIds.length > 0) {
      try {
        const found = await db
          .select({
            id: artifactsTable.id,
            name: artifactsTable.name,
            type: artifactsTable.type,
            size: artifactsTable.size,
            content: artifactsTable.content,
          })
          .from(artifactsTable)
          .where(
            and(eq(artifactsTable.userId, user.id), inArray(artifactsTable.id, rawArtifactIds))
          );
        validatedArtifacts = found.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          size: r.size,
          content: r.content,
        }));
      } catch {
        /* ignore */
      }
    }

    let agentName = "Plutão";
    let agentIdentity = "Assistente pessoal autônomo do usuário";
    try {
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

    const MAX_INJECT_CHARS = 12000;
    let artifactBlocks = "";
    if (validatedArtifacts.length > 0) {
      const parts: string[] = [];
      let used = 0;
      for (const a of validatedArtifacts) {
        const header = `--- Arquivo: ${a.name} (${formatFileSize(a.size)}, ${a.type}) ---\n`;
        const budget = MAX_INJECT_CHARS - used - header.length;
        if (budget <= 0) break;
        const bodyText =
          a.content.length > budget
            ? a.content.slice(0, budget) + "\n[...conteúdo truncado...]"
            : a.content;
        parts.push(header + bodyText);
        used += header.length + bodyText.length;
      }
      artifactBlocks = parts.join("\n\n");
    }

    const systemPrompt = `Você é o ${agentName}, ${agentIdentity}.

IDENTIDADE DO SISTEMA:
Você não é um chatbot genérico. Você é o Núcleo do Plutão (SO de trabalho):
conversa → descobre intenção → alinha caminho → executa de verdade → entrega artefato + evidência.

INTENÇÃO (classifique mentalmente a cada mensagem):
- chat: conversa casual, saudação, dúvida rápida — responda naturalmente, sem forçar missão.
- mission: tarefa pontual com objetivo claro.
- project: iniciativa maior (app, sistema, auditoria, construção) — descubra objetivo, restrições e perfil.
- config: ajustes de conta/preferências.

QUANDO FOR PROJETO OU MISSÃO:
1. Resuma o que entendeu em 2–4 linhas.
2. Faça só as perguntas essenciais que faltam (máx. 3).
3. Proponha 1 caminho recomendado (+ 1 alternativa se fizer diferença), com motivo objetivo.
4. Sugira um plano em passos numerados curtos (3–7 passos), um por linha, no formato:
   1. Título do passo
   2. Título do passo
5. Peça confirmação explícita antes de "começar a executar".
Nunca invente capacidades que o runtime ainda não tem. Seja objetivo e competente.

FALHAS E QUALIDADE:
Se algo falhar na execução, o sistema exige: Falha → Causa → Inspecionar → Corrigir → Testar → Passed.
Não incentive pular erros.

Tom: profissional, direto, sem emojis decorativos nem linguagem genérica de assistente.
${
  artifactBlocks
    ? `O usuário anexou arquivo(s). O conteúdo completo está disponível abaixo. Use-o para responder (resumo, análise, etc.). Não diga que não consegue ver anexos — o conteúdo já está no contexto.\n\n${artifactBlocks}`
    : ""
}`;

    const modelConfig = getModelConfig();

    if (!modelConfig) {
      const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
      const userText = lastUserMsg?.content || "";
      const artNotice =
        validatedArtifacts.length > 0
          ? ` (com ${validatedArtifacts.length} arquivo(s) anexado(s))`
          : "";
      const replyContent = `[${agentName}] Recebi sua mensagem: "${userText}"${artNotice}. O ambiente atual não possui MODEL_API_KEY configurada. Configure a chave de API nas variáveis de ambiente para respostas com o modelo ativo.`;

      return NextResponse.json({
        message: { role: "assistant", content: replyContent },
        readArtifacts: [],
        modelConfigured: false,
        suggestedPlan: null,
        missionId,
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
    const readArtifactIds = validatedArtifacts.map((a) => a.id);

    const assistantContent =
      (result.content && result.content.trim()) ||
      (validatedArtifacts.length > 0
        ? `Recebi o arquivo anexado (${validatedArtifacts.map((a) => a.name).join(", ")}). Não consegui gerar um resumo completo agora — tente de novo em instantes.`
        : "Não consegui gerar uma resposta agora. Tente novamente.");

    const suggestedPlan = extractSuggestedPlan(assistantContent);

    return NextResponse.json({
      message: { role: "assistant", content: assistantContent },
      readArtifacts: readArtifactIds,
      modelConfigured: true,
      provider: result.provider,
      model: result.model,
      suggestedPlan: suggestedPlan
        ? { stepTitles: suggestedPlan.stepTitles }
        : null,
      missionId,
    });
  } catch (e) {
    console.error("[chat POST]", e);
    const detail = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json(
      {
        error: "Não foi possível processar a mensagem no momento.",
        detail: process.env.NODE_ENV === "development" ? detail : undefined,
      },
      { status: 500 }
    );
  }
}
