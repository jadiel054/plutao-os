import { detectGitHubToolAction } from "@/lib/chat/githubToolRunner";
import type { ConnectorRuntimeSnapshot } from "@/lib/chat/connectorRuntime";

export type ReasoningStep = {
  id: string;
  index: number;
  text: string;
};

export type BuildReasoningStepsOptions = {
  userMessage: string;
  githubConnected?: boolean;
  githubLogin?: string | null;
  snapshot?: ConnectorRuntimeSnapshot;
  artifactsCount?: number;
  hasActiveMission?: boolean;
};

export function buildReasoningSteps(opts: BuildReasoningStepsOptions): ReasoningStep[] {
  const steps: string[] = [];
  const rawMsg = opts.userMessage.trim();
  const truncatedMsg = rawMsg.length > 80 ? rawMsg.slice(0, 77) + "..." : rawMsg;
  const artifactsCount = opts.artifactsCount ?? 0;
  const hasActiveMission = opts.hasActiveMission ?? false;

  const githubConnected = opts.snapshot ? opts.snapshot.githubConnected : (opts.githubConnected ?? false);
  const githubLogin = opts.snapshot ? opts.snapshot.githubLogin : (opts.githubLogin ?? null);
  const vercelConnected = opts.snapshot ? opts.snapshot.vercelConnected : false;
  const vercelLogin = opts.snapshot ? opts.snapshot.vercelLogin : null;

  // a. Leitura da mensagem
  steps.push(`▸ Lendo sua mensagem: "${truncatedMsg}"`);

  // Detect GitHub intent
  const githubPlan = detectGitHubToolAction(rawMsg, githubLogin);

  // Detect Vercel intent
  const lowerMsg = rawMsg.toLowerCase();
  const isVercelIntent = lowerMsg.includes("vercel") || lowerMsg.includes("deployment") || (lowerMsg.includes("projeto") && lowerMsg.includes("vercel"));

  if (githubPlan && githubConnected) {
    // b. Intenção
    let intentDesc = "consulta ao conector GitHub";
    if (githubPlan.action === "issues_list" || githubPlan.action === "issues_get") {
      intentDesc = "auditoria de issues de um repositório específico";
    } else if (githubPlan.action === "pulls_list") {
      intentDesc = "consulta de pull requests no GitHub";
    } else if (githubPlan.action === "actions_list") {
      intentDesc = "verificação de workflows do GitHub Actions";
    } else if (githubPlan.action === "repos_list" || githubPlan.action === "repo_get") {
      intentDesc = "detalhes de repositório no GitHub";
    }
    steps.push(`▸ Intenção: ${intentDesc}`);

    // c. Contexto
    const ctxParts: string[] = [];
    ctxParts.push(`conector GitHub conectado${githubLogin ? ` (@${githubLogin})` : ""}`);
    if (artifactsCount > 0) ctxParts.push(`${artifactsCount} arquivo(s) anexado(s)`);
    if (hasActiveMission) ctxParts.push("missão ativa vinculada");
    steps.push(`▸ Contexto: ${ctxParts.join(", ")}`);

    // d. Suposição (se aplicável)
    if (githubPlan.owner && githubPlan.repo) {
      steps.push(`▸ Suposição: "meu repositório" = ${githubPlan.owner}/${githubPlan.repo}`);
    } else if (githubPlan.repo) {
      steps.push(`▸ Suposição: repositório alvo = ${githubPlan.repo}`);
    } else if (githubLogin) {
      steps.push(`▸ Suposição: repositórios do usuário @${githubLogin}`);
    }

    // e. Avaliação do caminho
    steps.push(`▸ Caminho: preciso só consultar — ${githubPlan.action} resolve, sem escrita`);

    // f. Decisão final
    steps.push(`▸ Decisão: chamar ${githubPlan.action} e responder com o resumo.`);
  } else if (githubPlan && !githubConnected) {
    // Intent to use GitHub, but not connected
    steps.push(`▸ Intenção: consulta ao GitHub ("${githubPlan.repo || "repositório"}")`);
    steps.push(`▸ Contexto: conector GitHub não conectado`);
    steps.push(`▸ Caminho: conector ausente — orientar conexão necessária`);
    steps.push(`▸ Decisão: responder direto: orientação para conectar conta do GitHub.`);
  } else if (isVercelIntent && vercelConnected) {
    steps.push(`▸ Intenção: consulta ao conector Vercel`);
    const ctxParts: string[] = [`conector Vercel conectado${vercelLogin ? ` (@${vercelLogin})` : ""}`];
    if (artifactsCount > 0) ctxParts.push(`${artifactsCount} arquivo(s) anexado(s)`);
    if (hasActiveMission) ctxParts.push("missão ativa vinculada");
    steps.push(`▸ Contexto: ${ctxParts.join(", ")}`);
    steps.push(`▸ Caminho: consultar API Vercel via runner do conector`);
    steps.push(`▸ Decisão: chamar Vercel API e responder com os dados reais.`);
  } else if (isVercelIntent && !vercelConnected) {
    steps.push(`▸ Intenção: consulta à Vercel`);
    steps.push(`▸ Contexto: conector Vercel não conectado`);
    steps.push(`▸ Caminho: conector ausente — orientar conexão necessária em Configurações > Conectores`);
    steps.push(`▸ Decisão: responder direto: orientação para conectar Vercel.`);
  } else {
    // General chat / no tool required
    const isQuestion = rawMsg.includes("?") || lowerMsg.startsWith("como") || lowerMsg.startsWith("qual");
    const intentDesc = isQuestion ? "dúvida técnica / esclarecimento" : "conversa casual e interação direta";
    steps.push(`▸ Intenção: ${intentDesc}`);

    const ctxParts: string[] = ["modo chat direto"];
    if (artifactsCount > 0) ctxParts.push(`${artifactsCount} arquivo(s) anexado(s)`);
    if (hasActiveMission) ctxParts.push("missão ativa vinculada");
    steps.push(`▸ Contexto: ${ctxParts.join(", ")}`);

    steps.push(`▸ Caminho: resposta direta via modelo de linguagem, sem chamadas a ferramentas`);
    steps.push(`▸ Decisão: responder direto: resposta clara e objetiva.`);
  }

  return steps.map((text, idx) => ({
    id: `step-${idx + 1}`,
    index: idx + 1,
    text,
  }));
}
