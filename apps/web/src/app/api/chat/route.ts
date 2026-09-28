import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable, users, usageCounters, conversations, messages as messagesTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getPlanDefinition, PRESET_MODELS } from "@plutao/domain";
import { formatFileSize } from "@/lib/artifacts";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { incrementGuestMessageCount, GuestRateLimitError } from "@/lib/auth/guest";
import { loadConnectorRuntime, runConnectedConnectorTools, type ConnectorRuntimeSnapshot } from "@/lib/chat/connectorRuntime";
import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";
import { buildFollowUps } from "@/lib/chat/buildFollowUps";
import { getModelConfig } from "@/lib/runtime/model/config";
import { resolveCloudModelConfig } from "@/lib/runtime/model/resolveConfig";
import { chatCompletion, streamChatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage, MultimodalContentPart } from "@/lib/runtime/model/types";
import { VISION_CAPABLE_PROVIDERS, buildImageParts } from "@/lib/runtime/model/imageParts";
import { extractSuggestedPlan } from "@/lib/missions/extractPlan";
import { buildReasoningSteps } from "@/lib/chat/buildReasoningSteps";
import { redactSecrets, secretExposureNotice } from "@/lib/security/credentials";

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

async function getOrCreateConversation(
  db: ReturnType<typeof getDb>,
  userId: string,
  providedConversationId?: string | null,
  initialText?: string
): Promise<string | null> {
  try {
    if (providedConversationId) {
      const existing = await db
        .select({ id: conversations.id, userId: conversations.userId })
        .from(conversations)
        .where(eq(conversations.id, providedConversationId))
        .limit(1);

      if (existing[0] && existing[0].userId === userId) {
        return existing[0].id;
      }
    }

    const title = initialText && initialText.trim() ? initialText.trim().slice(0, 40) : "Nova conversa";
    const now = new Date();
    const created = await db
      .insert(conversations)
      .values({
        userId,
        title,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id });

    return created[0]?.id ?? null;
  } catch (err) {
    console.error("[getOrCreateConversation error]", err);
    return null;
  }
}

async function persistMessagePair(
  db: ReturnType<typeof getDb>,
  conversationId: string | null,
  userText: string,
  assistantText: string
) {
  if (!conversationId) return;
  try {
    const now = new Date();
    await db.insert(messagesTable).values([
      {
        conversationId,
        role: "user",
        content: userText,
        createdAt: now,
      },
      {
        conversationId,
        role: "assistant",
        content: assistantText,
        createdAt: new Date(now.getTime() + 10),
      },
    ]);

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error("[persistMessagePair error - chat response preserved]", err);
  }
}

async function incrementUsageCounter(db: ReturnType<typeof getDb>, userId: string, isPremium: boolean) {
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
    console.error("[incrementUsageCounter error]", err);
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getAuthOrGuestUser();
  } catch (err) {
    if (err instanceof GuestRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error("[POST /api/chat auth error]", err);
    return NextResponse.json({ error: "Erro de autenticação no servidor" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json(
      { error: "Sessão não encontrada ou expirada. Recarregue a página." },
      { status: 401 }
    );
  }

  // Se for convidado e tiver atingido o limite (10 msgs ou 15 min), bloqueia o chat
  if (user.isGuest && user.guestSession) {
    if (user.guestSession.isLimitReached) {
      return NextResponse.json(
        {
          guestLimitReached: true,
          limitReason: user.guestSession.limitReason,
          messageCount: user.guestSession.messageCount,
          secondsRemaining: user.guestSession.secondsRemaining,
          error: "Você atingiu o limite de uso como Convidado (10 mensagens ou 15 minutos). Faça login para continuar.",
        },
        { status: 403 }
      );
    }
  }

  try {
    // Convidados não possuem conectores ativos (modo leitura/básico apenas)
    const connectorSnap: ConnectorRuntimeSnapshot = user.isGuest
      ? {
          connectors: [],
          systemBlock: "\nCONECTORES ATIVOS:\nNenhum conector ativo (modo Convidado).",
          githubConnected: false,
          githubLogin: null,
          vercelConnected: false,
          vercelLogin: null,
          vercelToken: null,
        }
      : await loadConnectorRuntime(user.id);

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

    let secretsExposed = false;
    history = history.map((msg) => {
      const r = redactSecrets(msg.content);
      if (r.hadSecrets) secretsExposed = true;
      return { ...msg, content: r.text };
    });

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

    const providedConversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;

    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
    const lastUserText = lastUserMsg?.content || "";

    const db = getDb();
    const activeConversationId = await getOrCreateConversation(
      db,
      user.id,
      providedConversationId,
      lastUserText
    );

    // 1. Fetch user record for plan & preferred_model
    const userRows = await db
      .select({
        id: users.id,
        plan: users.plan,
        preferredModel: users.preferredModel,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const userRecord = userRows[0];
    const planDef = getPlanDefinition(userRecord?.plan);

    // 2. Query today's usage_counters
    const todayStr = new Date().toISOString().split("T")[0];
    const usageRows = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, user.id), eq(usageCounters.day, todayStr)))
      .limit(1);

    const currentUsage = usageRows[0] ?? { messages: 0, premiumMessages: 0 };

    // 3. Resolve preferred model & tier
    let isTargetModelPremium = false;
    let customModelConfig: ModelConfig | null = null;

    if (userRecord?.preferredModel) {
      const preferred = PRESET_MODELS.find((m) => m.id === userRecord.preferredModel);
      if (preferred) {
        const isPremium = preferred.tier === "premium";
        const isAllowedByPlan = planDef.models.includes(isPremium ? "premium" : "economy");
        if (isAllowedByPlan) {
          isTargetModelPremium = isPremium;
          const resolved = resolveCloudModelConfig(preferred.id);
          if (resolved.ok) {
            customModelConfig = resolved.config;
          } else {
            console.warn("[chat] preferredModel sem rota/chave:", preferred.id, resolved.error);
          }
        }
      }
    }

    // 4. Rate limits check
    if (planDef.cloudMessagesPerDay !== null && currentUsage.messages >= planDef.cloudMessagesPerDay) {
      const limitMsg = `Sua sonda atingiu o limite da ${planDef.label} (${planDef.cloudMessagesPerDay} mensagens em nuvem hoje). As transmissões renovam amanhã — ou conheça Caronte para ir além.`;
      return NextResponse.json(
        {
          limit: true,
          plan: planDef.id,
          used: currentUsage.messages,
          max: planDef.cloudMessagesPerDay,
          renews: "amanhã",
          error: limitMsg,
          message: limitMsg,
        },
        { status: 429 }
      );
    }

    if (isTargetModelPremium && planDef.premiumPerDay !== null && currentUsage.premiumMessages >= planDef.premiumPerDay) {
      const limitMsg = `Sua cota diária de modelos premium para o plano ${planDef.label} foi atingida (${planDef.premiumPerDay} mensagens). As transmissões renovam amanhã.`;
      return NextResponse.json(
        {
          limit: true,
          plan: planDef.id,
          used: currentUsage.premiumMessages,
          max: planDef.premiumPerDay,
          renews: "amanhã",
          error: limitMsg,
          message: limitMsg,
        },
        { status: 429 }
      );
    }

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

FORMATO DE RESPOSTA OBRIGATÓRIO:
Você DEVE iniciar TODA resposta gerando o bloco de raciocínio antes da resposta final ao usuário:
<raciocinio>
- Leitura: <resumo objetivo do pedido do usuário>
- Intenção: <o que o usuário deseja alcançar>
- Contexto: <elementos relevantes: histórico, missão ativa, conectores disponíveis>
- Suposições: <premissas ou suposições se houver>
- Caminho: <qual ferramenta ou resposta direta usar e por quê>
- Decisão: <ação final concreta a tomar>
</raciocinio>
<resposta>
<conteúdo final da resposta ao usuário>
</resposta>

REGRAS DO RACIOCÍNIO:
1. Raciocínio sempre em português (pt-BR).
2. De 3 a 8 linhas de reflexão genuína, fidedigna ao contexto real.
3. Se faltarem informações essenciais para executar uma ação, a Decisão DEVE ser "perguntar antes de executar".

IDENTIDADE DO SISTEMA:
Você é o Núcleo do Plutão (sistema de trabalho):
conversa → descobre intenção → alinha caminho → executa de verdade → entrega artefato + evidência.

CAPACIDADES DE RUNTIME (reais):
- Tools locais: note, filesystem (na execução da missão).
${connectorSnap.systemBlock}

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

Após listar projetos/repositórios com tool de conector: em 1–2 frases, destaque o item mais relevante (ex.: plutao-os ou o mais recente) e convide o usuário a ir a fundo — sem listas genéricas de 'próximos passos'.

Tom: sênior, profissional e direto. Sem emojis decorativos nem linguagem genérica de assistente. Não use rótulos de template como **Resumo:**, **Resultado:** ou **Próximos passos:** — escreva em prosa natural e objetiva. Em listas (ex.: repositórios, projetos), use itens numerados: 1. **nome** — visibilidade/status, detalhes curtos (uma linha por item).

SEGURANCA DE CREDENCIAIS:
- Tokens e API keys de conectores (GitHub, Vercel, Neon, Render, Stripe, Exa) sao dados sensiveis. Nunca peca para colar secret no chat; oriente a usar Configuracoes > Conectores.
- Se o usuario colar uma chave no chat, o sistema ja mascara (ex.: sk_live_****abcd). Nao repita o valor completo, nao grave em artefatos, nao ecoe na resposta.
- Ao concluir tarefa em que credencial pode ter vazado no historico, lembre em uma frase: revogue a chave no painel do provedor se foi exposta em texto claro.
- Prefira o token ja conectado no runtime em vez de qualquer string colada pelo usuario.
${
  artifactBlocks
    ? `O usuário pode anexar arquivos. Texto e planilhas chegam como conteúdo textual no contexto; imagens chegam como partes visuais quando processadas por um modelo multimodal. Se um anexo estiver visível no contexto, analise-o normalmente. Se por alguma falha técnica o conteúdo de um anexo não tiver chegado, seja honesto, diga que não recebeu o conteúdo e peça para tentar novamente — não finja ter visto.\n\nConteúdo dos anexos em texto:\n${artifactBlocks}`
    : ""
}`;

    const systemPromptFinal = secretsExposed
      ? systemPrompt +
        "\n\nAVISO RUNTIME: " +
        secretExposureNotice([{ kind: "exposta_no_chat", masked: "****", start: 0, end: 0 }])
      : systemPrompt;

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
