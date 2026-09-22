import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable, users, usageCounters } from "@plutao/db";
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
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || null;

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
      { error: "Sessão não encontrada ou expirada. Inicie uma nova sessão como convidado ou faça login." },
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

    const db = getDb();

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

    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
    const lastUserText = lastUserMsg?.content || "";

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
      effectiveModelConfig = customModelConfig || getModelConfig();
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
        githubConnected: connectorSnap.githubConnected,
        vercelConnected: connectorSnap.vercelConnected,
      });

      return NextResponse.json({
        message: { role: "assistant", content: replyContent },
        readArtifacts: [],
        modelConfigured: false,
        suggestedPlan: null,
        suggestedConnectors,
        missionId,
        connectors: {
          github: connectorSnap.githubConnected,
          vercel: connectorSnap.vercelConnected,
        },
      });
    }

    const reasoningSteps = buildReasoningSteps({
      userMessage: lastUserText,
      snapshot: connectorSnap,
      artifactsCount: validatedArtifacts.length,
      hasActiveMission: Boolean(missionId),
    });

    const isStreamRequested =
      Boolean(body.stream) ||
      req.headers.get("accept")?.includes("text/event-stream");

    if (isStreamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          function emit(event: string, data: Record<string, unknown>) {
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            } catch {
              /* ignore controller closed */
            }
          }

          try {
            // Build base payload for the model
            const payloadMessages: ModelMessage[] = [
              { role: "system", content: systemPromptFinal },
              ...history.slice(-10).map((m) => ({
                role: m.role,
                content: m.content,
              })),
            ];

            if (
              VISION_CAPABLE_PROVIDERS.includes(effectiveModelConfig!.provider) &&
              validatedArtifacts.length > 0
            ) {
              const imageParts = buildImageParts(validatedArtifacts);
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

            // ==========================================
            // FASE 1 — RACIOCÍNIO (token a token via LLM stream)
            // ==========================================
            const dynamicReasoningSteps: Array<{ id: string; index: number; text: string }> = [];
            let inReasoningBlock = false;
            let inAnswerBlock = false;
            let reasoningBuffer = "";
            let rawFullOutput = "";
            let streamModelConfig = effectiveModelConfig!;
            let modelFallback = false;

            try {
              const generator = streamChatCompletion(streamModelConfig, payloadMessages);
              for await (const chunk of generator) {
                rawFullOutput += chunk;

                if (!inReasoningBlock && !inAnswerBlock) {
                  if (rawFullOutput.includes("<raciocinio>")) {
                    inReasoningBlock = true;
                    const idx = rawFullOutput.indexOf("<raciocinio>");
                    reasoningBuffer = rawFullOutput.slice(idx + "<raciocinio>".length);
                  } else if (rawFullOutput.includes("<resposta>")) {
                    inAnswerBlock = true;
                  }
                } else if (inReasoningBlock) {
                  reasoningBuffer += chunk;
                  if (reasoningBuffer.includes("</raciocinio>")) {
                    const [reasoningPart] = reasoningBuffer.split("</raciocinio>");
                    const lines = reasoningPart.split("\n");
                    for (const rawLine of lines) {
                      const line = rawLine.trim();
                      if (line && !dynamicReasoningSteps.some((s) => s.text === line)) {
                        const stepIndex = dynamicReasoningSteps.length + 1;
                        const stepItem = { id: `step-${stepIndex}`, index: stepIndex, text: line };
                        dynamicReasoningSteps.push(stepItem);
                        emit("reasoning_step", stepItem);
                      }
                    }
                    inReasoningBlock = false;
                    inAnswerBlock = true;
                  } else {
                    const lines = reasoningBuffer.split("\n");
                    reasoningBuffer = lines.pop() ?? "";
                    for (const rawLine of lines) {
                      const line = rawLine.trim();
                      if (line && !dynamicReasoningSteps.some((s) => s.text === line)) {
                        const stepIndex = dynamicReasoningSteps.length + 1;
                        const stepItem = { id: `step-${stepIndex}`, index: stepIndex, text: line };
                        dynamicReasoningSteps.push(stepItem);
                        emit("reasoning_step", stepItem);
                      }
                    }
                  }
                }
              }
            } catch (err) {
              const isGemini = streamModelConfig.provider === "gemini";
              const fallbackConfig = isGemini ? getModelConfig() : null;
              if (isGemini && fallbackConfig) {
                streamModelConfig = fallbackConfig;
                modelFallback = true;
                rawFullOutput = "";
                reasoningBuffer = "";
                const generator = streamChatCompletion(streamModelConfig, payloadMessages);
                for await (const chunk of generator) {
                  rawFullOutput += chunk;
                  if (!inReasoningBlock && !inAnswerBlock) {
                    if (rawFullOutput.includes("<raciocinio>")) {
                      inReasoningBlock = true;
                      const idx = rawFullOutput.indexOf("<raciocinio>");
                      reasoningBuffer = rawFullOutput.slice(idx + "<raciocinio>".length);
                    } else if (rawFullOutput.includes("<resposta>")) {
                      inAnswerBlock = true;
                    }
                  } else if (inReasoningBlock) {
                    reasoningBuffer += chunk;
                    if (reasoningBuffer.includes("</raciocinio>")) {
                      const [reasoningPart] = reasoningBuffer.split("</raciocinio>");
                      const lines = reasoningPart.split("\n");
                      for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (line && !dynamicReasoningSteps.some((s) => s.text === line)) {
                          const stepIndex = dynamicReasoningSteps.length + 1;
                          const stepItem = { id: `step-${stepIndex}`, index: stepIndex, text: line };
                          dynamicReasoningSteps.push(stepItem);
                          emit("reasoning_step", stepItem);
                        }
                      }
                      inReasoningBlock = false;
                      inAnswerBlock = true;
                    } else {
                      const lines = reasoningBuffer.split("\n");
                      reasoningBuffer = lines.pop() ?? "";
                      for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (line && !dynamicReasoningSteps.some((s) => s.text === line)) {
                          const stepIndex = dynamicReasoningSteps.length + 1;
                          const stepItem = { id: `step-${stepIndex}`, index: stepIndex, text: line };
                          dynamicReasoningSteps.push(stepItem);
                          emit("reasoning_step", stepItem);
                        }
                      }
                    }
                  }
                }
              } else {
                throw err;
              }
            }

            // Flush remaining reasoning lines if present
            if (reasoningBuffer.trim()) {
              const lines = reasoningBuffer.replace("</raciocinio>", "").split("\n");
              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (line && !dynamicReasoningSteps.some((s) => s.text === line)) {
                  const stepIndex = dynamicReasoningSteps.length + 1;
                  const stepItem = { id: `step-${stepIndex}`, index: stepIndex, text: line };
                  dynamicReasoningSteps.push(stepItem);
                  emit("reasoning_step", stepItem);
                }
              }
            }

            // Fallback reasoning steps if LLM did not generate <raciocinio> tags
            const finalReasoningSteps =
              dynamicReasoningSteps.length > 0
                ? dynamicReasoningSteps
                : reasoningSteps;

            // ==========================================
            // FASE 2 — EXECUÇÃO (Tools de conectores - APÓS RACIOCÍNIO)
            // ==========================================
            const toolRunRes = await runConnectedConnectorTools({
              userId: user.id,
              userText: lastUserText,
              missionId,
              snapshot: connectorSnap,
            });

            if (toolRunRes.github.executed && toolRunRes.github.capability) {
              const toolId = crypto.randomUUID();
              emit("tool_start", {
                id: toolId,
                provider: "github",
                capability: toolRunRes.github.capability,
                summaryInput: toolRunRes.github.trace?.input,
              });

              if (toolRunRes.github.trace) {
                emit("tool_result", {
                  id: toolId,
                  status: toolRunRes.github.trace.status,
                  summaryOutput: toolRunRes.github.trace.output.slice(0, 300),
                  fullInput: toolRunRes.github.trace.input,
                  fullOutput: toolRunRes.github.trace.output,
                  durationMs: toolRunRes.github.trace.durationMs,
                });
              }
            }

            if (toolRunRes.vercel.executed && toolRunRes.vercel.capability) {
              const toolId = crypto.randomUUID();
              emit("tool_start", {
                id: toolId,
                provider: "vercel",
                capability: toolRunRes.vercel.capability,
                summaryInput: toolRunRes.vercel.trace?.input,
              });

              if (toolRunRes.vercel.trace) {
                emit("tool_result", {
                  id: toolId,
                  status: toolRunRes.vercel.trace.status,
                  summaryOutput: toolRunRes.vercel.trace.output.slice(0, 300),
                  fullInput: toolRunRes.vercel.trace.input,
                  fullOutput: toolRunRes.vercel.trace.output,
                  durationMs: toolRunRes.vercel.trace.durationMs,
                });
              }
            }

            // ==========================================
            // FASE 3 — RESPOSTA (Content Delta & Done)
            // ==========================================
            let assistantContent = "";

            if (toolRunRes.contextBlocks.length > 0) {
              // Re-run LLM streaming with tool context blocks included so final answer uses real tool results
              const responsePayloadMessages: ModelMessage[] = [
                ...payloadMessages,
                ...toolRunRes.contextBlocks.map((cb) => ({
                  role: "system" as const,
                  content: cb,
                })),
                {
                  role: "user" as const,
                  content: "Gere agora a resposta final para o usuário com base nos resultados obtidos das ferramentas e no raciocínio prévio.",
                },
              ];

              let inStreamAnswerBlock = false;
              let rawStreamOutput = "";

              try {
                const answerGenerator = streamChatCompletion(streamModelConfig, responsePayloadMessages);
                for await (const chunk of answerGenerator) {
                  rawStreamOutput += chunk;
                  if (!inStreamAnswerBlock) {
                    if (rawStreamOutput.includes("<resposta>")) {
                      inStreamAnswerBlock = true;
                      const idx = rawStreamOutput.indexOf("<resposta>");
                      const firstText = rawStreamOutput.slice(idx + "<resposta>".length);
                      if (firstText) {
                        emit("content_delta", { text: firstText });
                      }
                    } else if (!rawStreamOutput.includes("<")) {
                      // Direct output without tags
                      emit("content_delta", { text: chunk });
                    }
                  } else {
                    const cleanChunk = chunk.replace("</resposta>", "");
                    if (cleanChunk) {
                      emit("content_delta", { text: cleanChunk });
                    }
                  }
                }
              } catch {
                /* fallback to prompt completion */
              }

              let cleaned = rawStreamOutput;
              if (cleaned.includes("<resposta>")) {
                cleaned = cleaned.split("<resposta>")[1] || "";
              }
              assistantContent = cleaned.replace(/<\/?resposta>/g, "").trim();
            }

            if (!assistantContent) {
              let cleanedAnswer = rawFullOutput;
              if (cleanedAnswer.includes("<resposta>")) {
                cleanedAnswer = cleanedAnswer.split("<resposta>")[1] || "";
              }
              cleanedAnswer = cleanedAnswer
                .replace(/<\/?raciocinio>/g, "")
                .replace(/<\/?resposta>/g, "")
                .trim();

              if (!cleanedAnswer) {
                cleanedAnswer = "Não consegui gerar uma resposta agora. Tente novamente.";
              }

              const words = cleanedAnswer.split(" ");
              let chunk = "";
              for (let i = 0; i < words.length; i++) {
                chunk += (i === 0 ? "" : " ") + words[i];
                if (chunk.length >= 20 || i === words.length - 1) {
                  emit("content_delta", { text: chunk });
                  chunk = "";
                }
              }
              assistantContent = cleanedAnswer;
            }

            const suggestedPlan = extractSuggestedPlan(assistantContent);
            const suggestedConnectors = detectSuggestedConnectors({
              lastUserText,
              assistantText: assistantContent,
              githubConnected: connectorSnap.githubConnected,
              vercelConnected: connectorSnap.vercelConnected,
            });

            const baseFollowUps = buildFollowUps({
              lastUserText,
              assistantText: assistantContent,
              tools: [
                toolRunRes.github.executed && toolRunRes.github.trace
                  ? {
                      provider: "github",
                      capability: toolRunRes.github.capability,
                      status: toolRunRes.github.trace.status,
                      outputSnippet: toolRunRes.github.trace.output,
                    }
                  : null,
                toolRunRes.vercel.executed && toolRunRes.vercel.trace
                  ? {
                      provider: "vercel",
                      capability: toolRunRes.vercel.capability,
                      status: toolRunRes.vercel.trace.status,
                      outputSnippet: toolRunRes.vercel.trace.output,
                    }
                  : null,
              ].filter(Boolean) as Array<{
                provider: string;
                capability?: string;
                status?: string;
                outputSnippet?: string;
              }>,
            });

            const suggestedFollowUps = [
              ...(toolRunRes.suggestedFollowUps || []),
              ...baseFollowUps,
            ].filter((f, idx, self) => idx === self.findIndex((x) => x.prompt === f.prompt));

            const toolTraces = [];
            if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);
            if (toolRunRes.vercel.trace) toolTraces.push(toolRunRes.vercel.trace);

            const trace = toolTraces.length > 0 ? { toolCalls: toolTraces } : undefined;

            const steps: Array<
              | { type: "reasoning"; reasoning: { id: string; index: number; text: string } }
              | { type: "tool_call"; toolCall: Record<string, unknown> }
            > = finalReasoningSteps.map((step) => ({
              type: "reasoning" as const,
              reasoning: step,
            }));

            if (toolRunRes.github.executed && toolRunRes.github.trace) {
              steps.push({
                type: "tool_call" as const,
                toolCall: {
                  id: toolRunRes.github.trace.id,
                  provider: "github",
                  capability: toolRunRes.github.trace.capability,
                  status: toolRunRes.github.trace.status,
                  summaryInput:
                    typeof toolRunRes.github.trace.input === "string"
                      ? toolRunRes.github.trace.input
                      : JSON.stringify(toolRunRes.github.trace.input),
                  summaryOutput: toolRunRes.github.trace.output.slice(0, 300),
                  fullInput: toolRunRes.github.trace.input,
                  fullOutput: toolRunRes.github.trace.output,
                  durationMs: toolRunRes.github.trace.durationMs,
                },
              });
            }

            if (toolRunRes.vercel.executed && toolRunRes.vercel.trace) {
              steps.push({
                type: "tool_call" as const,
                toolCall: {
                  id: toolRunRes.vercel.trace.id,
                  provider: "vercel",
                  capability: toolRunRes.vercel.trace.capability,
                  status: toolRunRes.vercel.trace.status,
                  summaryInput:
                    typeof toolRunRes.vercel.trace.input === "string"
                      ? toolRunRes.vercel.trace.input
                      : JSON.stringify(toolRunRes.vercel.trace.input),
                  summaryOutput: toolRunRes.vercel.trace.output.slice(0, 300),
                  fullInput: toolRunRes.vercel.trace.input,
                  fullOutput: toolRunRes.vercel.trace.output,
                  durationMs: toolRunRes.vercel.trace.durationMs,
                },
              });
            }

            let updatedGuestSession = user.guestSession;
            if (user.isGuest && user.guestSession) {
              const updated = await incrementGuestMessageCount(user.guestSession.id);
              if (updated) {
                updatedGuestSession = updated;
              }
            } else {
              await incrementUsageCounter(db, user.id, isTargetModelPremium);
            }

            emit("done", {
              full: assistantContent,
              provider: streamModelConfig.provider,
              model: streamModelConfig.model,
              modelFallback,
              guestSession: updatedGuestSession,
              suggestedPlan: suggestedPlan
                ? { stepTitles: suggestedPlan.stepTitles }
                : null,
              suggestedConnectors,
              suggestedFollowUps,
              missionId,
              connectors: {
                github: connectorSnap.githubConnected,
                vercel: connectorSnap.vercelConnected,
              },
              steps: steps.length > 0 ? steps : undefined,
              trace,
            });
          } catch (err) {
            emit("error", {
              error: err instanceof Error ? err.message : "Erro no streaming de resposta",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streamed JSON handling
    const toolRunRes = await runConnectedConnectorTools({
      userId: user.id,
      userText: lastUserText,
      missionId,
      snapshot: connectorSnap,
    });

    const payloadMessages: ModelMessage[] = [
      { role: "system", content: systemPromptFinal },
      ...history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    for (const contextBlock of toolRunRes.contextBlocks) {
      payloadMessages.push({
        role: "system",
        content: contextBlock,
      });
    }

    if (VISION_CAPABLE_PROVIDERS.includes(effectiveModelConfig.provider) && validatedArtifacts.length > 0) {
      const imageParts = buildImageParts(validatedArtifacts);

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

    let result;
    let modelFallback = false;

    try {
      result = await chatCompletion(effectiveModelConfig, payloadMessages);
    } catch (err) {
      const isGemini = effectiveModelConfig.provider === "gemini";
      const fallbackConfig = isGemini ? getModelConfig() : null;

      const errMsg = err instanceof Error ? err.message : String(err);
      const isClient4xx = /\b(400|401|403|413|422)\b/.test(errMsg) && !/\b(408|429)\b/.test(errMsg);

      if (isGemini && fallbackConfig && !isClient4xx) {
        console.warn("[chat] Gemini indisponível, fallback para", fallbackConfig.model, "-", errMsg);

        if (VISION_CAPABLE_PROVIDERS.includes(fallbackConfig.provider) && validatedArtifacts.length > 0) {
          const imageParts = buildImageParts(validatedArtifacts);
          if (imageParts.length > 0 && payloadMessages.length > 0) {
            const lastIdx = payloadMessages.length - 1;
            const existingContent =
              typeof payloadMessages[lastIdx].content === "string"
                ? (payloadMessages[lastIdx].content as string)
                : Array.isArray(payloadMessages[lastIdx].content)
                  ? (payloadMessages[lastIdx].content as MultimodalContentPart[]).find((p) => p.type === "text")?.text || ""
                  : "";
            payloadMessages[lastIdx] = {
              role: payloadMessages[lastIdx].role,
              content: [{ type: "text", text: existingContent }, ...imageParts],
            };
          }
        }

        try {
          result = await chatCompletion(fallbackConfig, payloadMessages);
          modelFallback = true;
        } catch (fallbackErr) {
          console.error("[chat] Fallback provider também falhou:", fallbackErr);
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }

    const readArtifactIds = validatedArtifacts.map((a) => a.id);

    const rawOutput = result.content || "";
    let extractedReasoningSteps: Array<{ id: string; index: number; text: string }> = [];

    if (rawOutput.includes("<raciocinio>")) {
      const match = rawOutput.match(/<raciocinio>([\s\S]*?)<\/raciocinio>/);
      if (match && match[1]) {
        const lines = match[1].split("\n").map((l) => l.trim()).filter(Boolean);
        extractedReasoningSteps = lines.map((l, idx) => ({
          id: `step-${idx + 1}`,
          index: idx + 1,
          text: l,
        }));
      }
    }

    let cleanedNonStreamAnswer = rawOutput;
    if (cleanedNonStreamAnswer.includes("<resposta>")) {
      cleanedNonStreamAnswer = cleanedNonStreamAnswer.split("<resposta>")[1] || "";
    }
    cleanedNonStreamAnswer = cleanedNonStreamAnswer
      .replace(/<\/?raciocinio>/g, "")
      .replace(/<\/?resposta>/g, "")
      .trim();

    const assistantContent =
      cleanedNonStreamAnswer ||
      (validatedArtifacts.length > 0
        ? `Recebi o arquivo anexado (${validatedArtifacts.map((a) => a.name).join(", ")}). Não consegui gerar um resumo completo agora — tente de novo em instantes.`
        : "Não consegui gerar uma resposta agora. Tente novamente.");

    const suggestedPlan = extractSuggestedPlan(assistantContent);
    const suggestedConnectors = detectSuggestedConnectors({
      lastUserText,
      assistantText: assistantContent,
      githubConnected: connectorSnap.githubConnected,
      vercelConnected: connectorSnap.vercelConnected,
    });

    const baseFollowUps = buildFollowUps({
      lastUserText,
      assistantText: assistantContent,
      tools: [
        toolRunRes.github.executed && toolRunRes.github.trace
          ? {
              provider: "github",
              capability: toolRunRes.github.capability,
              status: toolRunRes.github.trace.status,
              outputSnippet: toolRunRes.github.trace.output,
            }
          : null,
        toolRunRes.vercel.executed && toolRunRes.vercel.trace
          ? {
              provider: "vercel",
              capability: toolRunRes.vercel.capability,
              status: toolRunRes.vercel.trace.status,
              outputSnippet: toolRunRes.vercel.trace.output,
            }
          : null,
      ].filter(Boolean) as Array<{
        provider: string;
        capability?: string;
        status?: string;
        outputSnippet?: string;
      }>,
    });

    const suggestedFollowUps = [
      ...(toolRunRes.suggestedFollowUps || []),
      ...baseFollowUps,
    ].filter((f, idx, self) => idx === self.findIndex((x) => x.prompt === f.prompt));

    const toolTraces = [];
    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);
    if (toolRunRes.vercel.trace) toolTraces.push(toolRunRes.vercel.trace);

    const trace = toolTraces.length > 0 ? { toolCalls: toolTraces } : undefined;

    const activeReasoningSteps =
      extractedReasoningSteps.length > 0 ? extractedReasoningSteps : reasoningSteps;

    const steps: Array<
      | { type: "reasoning"; reasoning: { id: string; index: number; text: string } }
      | { type: "tool_call"; toolCall: Record<string, unknown> }
    > = activeReasoningSteps.map((step) => ({
      type: "reasoning" as const,
      reasoning: step,
    }));

    if (toolRunRes.github.executed && toolRunRes.github.trace) {
      steps.push({
        type: "tool_call" as const,
        toolCall: {
          id: toolRunRes.github.trace.id,
          provider: "github",
          capability: toolRunRes.github.trace.capability,
          status: toolRunRes.github.trace.status,
          summaryInput:
            typeof toolRunRes.github.trace.input === "string"
              ? toolRunRes.github.trace.input
              : JSON.stringify(toolRunRes.github.trace.input),
          summaryOutput: toolRunRes.github.trace.output.slice(0, 300),
          fullInput: toolRunRes.github.trace.input,
          fullOutput: toolRunRes.github.trace.output,
          durationMs: toolRunRes.github.trace.durationMs,
        },
      });
    }

    if (toolRunRes.vercel.executed && toolRunRes.vercel.trace) {
      steps.push({
        type: "tool_call" as const,
        toolCall: {
          id: toolRunRes.vercel.trace.id,
          provider: "vercel",
          capability: toolRunRes.vercel.trace.capability,
          status: toolRunRes.vercel.trace.status,
          summaryInput:
            typeof toolRunRes.vercel.trace.input === "string"
              ? toolRunRes.vercel.trace.input
              : JSON.stringify(toolRunRes.vercel.trace.input),
          summaryOutput: toolRunRes.vercel.trace.output.slice(0, 300),
          fullInput: toolRunRes.vercel.trace.input,
          fullOutput: toolRunRes.vercel.trace.output,
          durationMs: toolRunRes.vercel.trace.durationMs,
        },
      });
    }

    let updatedGuestSession = user.guestSession;
    if (user.isGuest && user.guestSession) {
      const updated = await incrementGuestMessageCount(user.guestSession.id);
      if (updated) {
        updatedGuestSession = updated;
      }
    } else {
      await incrementUsageCounter(db, user.id, isTargetModelPremium);
    }

    return NextResponse.json({
      message: { role: "assistant", content: assistantContent },
      readArtifacts: readArtifactIds,
      modelConfigured: true,
      provider: result.provider,
      model: result.model,
      modelFallback,
      guestSession: updatedGuestSession,
      suggestedPlan: suggestedPlan
        ? { stepTitles: suggestedPlan.stepTitles }
        : null,
      suggestedConnectors,
      suggestedFollowUps,
      missionId,
      connectors: {
        github: connectorSnap.githubConnected,
        vercel: connectorSnap.vercelConnected,
      },
      steps: steps.length > 0 ? steps : undefined,
      trace,
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
