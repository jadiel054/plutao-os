import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { agents, artifacts as artifactsTable } from "@plutao/db";
import { getDb } from "@/lib/db";
import { formatFileSize } from "@/lib/artifacts";
import { getSessionUser } from "@/lib/auth/session";
import { getModelConfig } from "@/lib/runtime/model/config";
import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelMessage } from "@/lib/runtime/model/types";

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
          // Aceita estritamente apenas 'user' ou 'assistant'. Descarta 'system' enviado pelo cliente.
          if (m.role !== "user" && m.role !== "assistant") return null;
          const content = String(m.content ?? "").trim();
          if (!content) return null;
          return {
            role: m.role,
            content,
          };
        })
        .filter((m: ChatInputMessage | null): m is ChatInputMessage => m !== null);
    } else if (typeof body.message === "string" && body.message.trim().length > 0) {
      history = [{ role: "user", content: body.message.trim() }];
    }

    if (history.length === 0) {
      return NextResponse.json(
        { error: "Mensagem inválida ou vazia" },
        { status: 400 }
      );
    }

    // Validação de limites explícitos de entrada
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

    // Processa referências a artifacts enviados
    const db = getDb();
    let rawArtifactIds: string[] = [];
    if (Array.isArray(body.artifactIds)) {
      rawArtifactIds = body.artifactIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0);
    }

    type AttachedArtifactMeta = {
      id: string;
      name: string;
      type: string;
      size: number;
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
          })
          .from(artifactsTable)
          .where(
            and(
              eq(artifactsTable.userId, user.id),
              inArray(artifactsTable.id, rawArtifactIds)
            )
          );
        validatedArtifacts = found;
      } catch {
        /* ignore DB read error on artifacts */
      }
    }

    // Carrega identidade do Agente do usuário
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

    let artifactContextPrompt = "";
    if (validatedArtifacts.length > 0) {
      const listStr = validatedArtifacts
        .map((a) => `"${a.name}" (ID: ${a.id}, tamanho: ${formatFileSize(a.size)}, tipo: ${a.type})`)
        .join(", ");
      artifactContextPrompt = `\n\nContexto de Artifacts disponíveis nesta conversa: ${listStr}.
Para ler o conteúdo integral de um artifact quando necessário para responder com precisão ao usuário, você pode propor a ferramenta:
{"tool":"read_artifact","input":"<ID_DO_ARTIFACT>"}
Caso não seja necessário ler o conteúdo completo para responder à pergunta do usuário, responda diretamente em texto plano.`;
    }

    const systemPrompt = `Você é o ${agentName}, ${agentIdentity}.
Responda de forma clara, prestativa e objetiva ao usuário. Preserve um tom profissional e amigável.${artifactContextPrompt}`;

    const modelConfig = getModelConfig();

    if (!modelConfig) {
      // Fallback amigável quando a API Key do modelo ainda não está configurada
      const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
      const userText = lastUserMsg?.content || "";
      const artNotice = validatedArtifacts.length > 0 ? ` (com ${validatedArtifacts.length} arquivo(s) anexado(s))` : "";
      const replyContent = `[${agentName}] Recebi sua mensagem: "${userText}"${artNotice}. O ambiente atual não possui MODEL_API_KEY configurada. Configure a chave de API nas variáveis de ambiente para respostas inteligentes com LLM.`;

      return NextResponse.json({
        message: {
          role: "assistant",
          content: replyContent,
        },
        readArtifacts: [],
        modelConfigured: false,
      });
    }

    // Apenas mensagens 'user' e 'assistant' do histórico entram no payload do modelo.
    // O 'systemPrompt' permanece exclusivamente gerado pelo servidor.
    const payloadMessages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    let result = await chatCompletion(modelConfig, payloadMessages);
    const readArtifactIds: string[] = [];

    // Verificação de Tool Proposal para leitura de artifact sob demanda (1 nível de resolução max)
    if (result.toolProposal && (result.toolProposal.name === "read_artifact" || result.toolProposal.name === "read")) {
      let rawInput = result.toolProposal.input.trim();
      if (rawInput.startsWith("{") && rawInput.endsWith("}")) {
        try {
          const parsed = JSON.parse(rawInput);
          rawInput = String(parsed.artifactId || parsed.id || parsed.input || rawInput).trim();
        } catch {
          /* ignore json parse */
        }
      }

      // Valida se o ID solicitado foi previamente validado para este usuário e mensagem
      const targetArtifact = validatedArtifacts.find((a) => a.id === rawInput);
      if (targetArtifact) {
        try {
          const artRows = await db
            .select({
              id: artifactsTable.id,
              name: artifactsTable.name,
              content: artifactsTable.content,
            })
            .from(artifactsTable)
            .where(
              and(
                eq(artifactsTable.id, targetArtifact.id),
                eq(artifactsTable.userId, user.id)
              )
            )
            .limit(1);

          if (artRows[0]) {
            readArtifactIds.push(artRows[0].id);

            const followUpMessages: ModelMessage[] = [
              ...payloadMessages,
              {
                role: "assistant",
                content: JSON.stringify({
                  tool: "read_artifact",
                  input: artRows[0].id,
                }),
              },
              {
                role: "user",
                content: `[Conteúdo retornado da ferramenta read_artifact para "${artRows[0].name}" (${artRows[0].id})]:\n${artRows[0].content}`,
              },
            ];

            const secondResult = await chatCompletion(modelConfig, followUpMessages);
            result = secondResult;
          }
        } catch (readErr) {
          console.error("[read_artifact tool error]", readErr);
        }
      }
    }

    return NextResponse.json({
      message: {
        role: "assistant",
        content: result.content,
      },
      readArtifacts: readArtifactIds,
      modelConfigured: true,
      provider: result.provider,
      model: result.model,
    });
  } catch (e) {
    // Log interno detalhado no servidor
    console.error("[chat POST]", e);

    // Resposta genérica e segura ao cliente, sem expor detalhes do provider/infraestrutura
    return NextResponse.json(
      { error: "Não foi possível processar a mensagem no momento." },
      { status: 500 }
    );
  }
}
