import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { formatFileSize } from "@/lib/artifacts";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessToken, getConnectorRow } from "@/lib/connectors/service";
import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage, MultimodalContentPart } from "@/lib/runtime/model/types";
import { extractSuggestedPlan } from "@/lib/missions/extractPlan";

export const runtime = "nodejs";

type ChatInputMessage = {
  role: "user" | "assistant";
  content: string;
};

type AttachedArtifactMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  metadata: Record<string, unknown>;
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
            metadata: artifactsTable.metadata,
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
          metadata: (r.metadata as Record<string, unknown>) || {},
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

    let githubConnected = false;
    let githubLogin: string | null = null;
    try {
      const token = await getAccessToken(user.id, "github");
      githubConnected = Boolean(token);
      if (githubConnected) {
        const row = await getConnectorRow(user.id, "github");
        githubLogin = row?.accountLogin ?? null;
      }
    } catch {
      /* connector table may be missing until migration 0004 */
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

    const runtimeCapabilities = githubConnected
      ? `CAPACIDADES DE RUNTIME (reais):
- Tools locais: note, filesystem (na execução da missão).
- GitHub: CONECTADO${githubLogin ? ` (@${githubLogin})` : ""}. Na execução, a tool "github" pode: repos_list, repo_get, issues_list, issues_get, pulls_list, actions_list. Inclua no plano quando o objetivo envolver repositórios, issues, PRs ou actions.
- Não invente outras tools ou provedores.`
      : `CAPACIDADES DE RUNTIME (reais):
- Tools locais: note, filesystem (na execução da missão).
- GitHub: NÃO CONECTADO. A interface pode mostrar um card "Conectar" no chat. Explique de forma breve que a integração é necessária; não diga que já conectou. Não invente outras tools.`;

    const systemPrompt = `Você é o ${agentName}, ${agentIdentity}.

IDENTIDADE DO SISTEMA:
Você é o Núcleo do Plutão (sistema de trabalho):
conversa → descobre intenção → alinha caminho → executa de verdade → entrega artefato + evidência.

INTENÇÃO (classifique mentalmente a cada mensagem):
- chat: conversa casual, saudação, dúvida rápida — responda naturally, sem forçar missão.
- mission: tarefa pontual com objetivo claro.
- project: iniciativa maior (app, sistema, auditoria, construção) — descubra objetivo, restrições e perfil.
- config: ajustes de conta/preferências.

${runtimeCapabilities}

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

    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
    const lastUserText = lastUserMsg?.content || "";

    // Roteamento inteligente de modelo:
    // Se a mensagem contiver imagem ou documento binário (PDF, Excel) anexado e GEMINI_API_KEY estiver configurada,
    // roteamos especificamente para o Gemini 3.1 Flash-Lite (gemini-3.1-flash-lite) via endpoint compatível com OpenAI.
    const hasImageOrBinary = validatedArtifacts.some((a) => {
      const meta = a.metadata || {};
      return (
        Boolean(meta.isImage) ||
        Boolean(meta.isBinary) ||
        a.type.startsWith("image/") ||
        a.type === "application/pdf" ||
        a.type.includes("excel") ||
        a.type.includes("spreadsheet")
      );
    });

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    let effectiveModelConfig: ModelConfig | null = null;

    if (hasImageOrBinary && geminiKey) {
      effectiveModelConfig = {
        provider: "gemini",
        apiKey: geminiKey,
        model: "gemini-3.1-flash-lite",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      };
    } else {
      effectiveModelConfig = getModelConfig();
    }

    if (!effectiveModelConfig) {
      const artNotice =
        validatedArtifacts.length > 0
          ? ` (com ${validatedArtifacts.length} arquivo(s) anexado(s))`
          : "";
      const replyContent = `[${agentName}] Recebi sua mensagem: "${lastUserText}"${artNotice}. O ambiente atual não possui MODEL_API_KEY / GEMINI_API_KEY configurada. Configure a chave de API nas variáveis de ambiente do Vercel.`;

      const suggestedConnectors = detectSuggestedConnectors({
        lastUserText,
        assistantText: replyContent,
        githubConnected,
      });

      return NextResponse.json({
        message: { role: "assistant", content: replyContent },
        readArtifacts: [],
        modelConfigured: false,
        suggestedPlan: null,
        suggestedConnectors,
        missionId,
        connectors: { github: githubConnected },
      });
    }

    const payloadMessages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Se o provedor for Gemini/multimodal e houver imagens anexadas, formatar o último mensagem do usuário com partes de imagem
    if (effectiveModelConfig.provider === "gemini" && validatedArtifacts.length > 0) {
      const imageParts: MultimodalContentPart[] = [];
      for (const a of validatedArtifacts) {
        const meta = a.metadata || {};
        if (Boolean(meta.isImage) || a.type.startsWith("image/")) {
          const url = (meta.dataUrl as string) || (meta.blobUrl as string);
          if (url) {
            imageParts.push({ type: "image_url", image_url: { url } });
          }
        }
      }

      if (imageParts.length > 0 && payloadMessages.length > 0) {
        const lastIdx = payloadMessages.length - 1;
        const existingContent =
          typeof payloadMessages[lastIdx].content === "string"
            ? (payloadMessages[lastIdx].content as string)
            : "";
        payloadMessages[lastIdx] = {
          role: payloadMessages[lastIdx].role,
          content: [{ type: "text", text: existingContent }, ...imageParts],
        };
      }
    }

    const result = await chatCompletion(effectiveModelConfig, payloadMessages);
    const readArtifactIds = validatedArtifacts.map((a) => a.id);

    const assistantContent =
      (result.content && result.content.trim()) ||
      (validatedArtifacts.length > 0
        ? `Recebi o arquivo anexado (${validatedArtifacts.map((a) => a.name).join(", ")}). Não consegui gerar um resumo completo agora — tente de novo em instantes.`
        : "Não consegui gerar uma resposta agora. Tente novamente.");

    const suggestedPlan = extractSuggestedPlan(assistantContent);
    const suggestedConnectors = detectSuggestedConnectors({
      lastUserText,
      assistantText: assistantContent,
      githubConnected,
    });

    return NextResponse.json({
      message: { role: "assistant", content: assistantContent },
      readArtifacts: readArtifactIds,
      modelConfigured: true,
      provider: result.provider,
      model: result.model,
      suggestedPlan: suggestedPlan
        ? { stepTitles: suggestedPlan.stepTitles }
        : null,
      suggestedConnectors,
      missionId,
      connectors: { github: githubConnected },
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
