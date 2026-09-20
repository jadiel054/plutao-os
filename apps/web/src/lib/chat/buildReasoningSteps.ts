import { detectGitHubToolAction } from "@/lib/chat/githubToolRunner";

export type ReasoningStep = {
  id: string;
  index: number;
  text: string;
};

export type BuildReasoningStepsOptions = {
  userMessage: string;
  githubConnected: boolean;
  githubLogin: string | null;
  artifactsCount?: number;
  hasActiveMission?: boolean;
};

export function buildReasoningSteps(opts: BuildReasoningStepsOptions): ReasoningStep[] {
  const steps: string[] = [];
  const rawMsg = opts.userMessage.trim();
  const truncatedMsg = rawMsg.length > 80 ? rawMsg.slice(0, 77) + "..." : rawMsg;
  const artifactsCount = opts.artifactsCount ?? 0;
  const hasActiveMission = opts.hasActiveMission ?? false;

  // a. Leitura da mensagem
  steps.push(`▸ Lendo sua mensagem: "${truncatedMsg}"`);

  // Detect GitHub intent
  const githubPlan = detectGitHubToolAction(rawMsg, opts.githubLogin);

  if (githubPlan && opts.githubConnected) {
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
    ctxParts.push(`conector GitHub conectado${opts.githubLogin ? ` (@${opts.githubLogin})` : ""}`);
    if (artifactsCount > 0) ctxParts.push(`${artifactsCount} arquivo(s) anexado(s)`);
    if (hasActiveMission) ctxParts.push("missão ativa vinculada");
    steps.push(`▸ Contexto: ${ctxParts.join(", ")}`);

    // d. Suposição (se aplicável)
    if (githubPlan.owner && githubPlan.repo) {
      steps.push(`▸ Suposição: "meu repositório" = ${githubPlan.owner}/${githubPlan.repo}`);
    } else if (githubPlan.repo) {
      steps.push(`▸ Suposição: repositório alvo = ${githubPlan.repo}`);
    } else if (opts.githubLogin) {
      steps.push(`▸ Suposição: repositórios do usuário @${opts.githubLogin}`);
    }

    // e. Avaliação do caminho
    steps.push(`▸ Caminho: preciso só consultar — ${githubPlan.action} resolve, sem escrita`);

    // f. Decisão final
    steps.push(`▸ Decisão: chamar ${githubPlan.action} e responder com o resumo.`);
  } else if (githubPlan && !opts.githubConnected) {
    // Intent to use GitHub, but not connected
    steps.push(`▸ Intenção: consulta ao GitHub ("${githubPlan.repo || "repositório"}")`);
    steps.push(`▸ Contexto: conector GitHub não conectado`);
    steps.push(`▸ Caminho: conector ausente — orientar conexão necessária`);
    steps.push(`▸ Decisão: responder direto: orientação para conectar conta do GitHub.`);
  } else {
    // General chat / no tool required
    const isQuestion = rawMsg.includes("?") || rawMsg.toLowerCase().startsWith("como") || rawMsg.toLowerCase().startsWith("qual");
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
