/**
 * Detecta quando a conversa pede capacidade de um conector que ainda não está ligado.
 * Determinístico (não depende do modelo inventar JSON) — o card no chat é do produto.
 */

export type SuggestedConnector = {
  provider: string;
  displayName: string;
  status: string;
  reason?: string;
};

const GITHUB_NEED =
  /\b(github|reposit[oó]rio|reposit[oó]rios|repo\b|pull request|\bprs?\b|\bissues?\b|workflow|actions|commit|branch|merge)\b/i;

const VERCEL_NEED =
  /\b(vercel|deployments?|deploy\b|projetos?\s+na?\s+vercel)\b/i;

export function detectSuggestedConnectors(opts: {
  lastUserText: string;
  assistantText: string;
  githubConnected?: boolean;
  vercelConnected?: boolean;
}): SuggestedConnector[] {
  const out: SuggestedConnector[] = [];
  const blob = `${opts.lastUserText}\n${opts.assistantText}`;

  if (!opts.githubConnected && GITHUB_NEED.test(blob)) {
    out.push({
      provider: "github",
      displayName: "GitHub",
      status: "disconnected",
      reason:
        "O objetivo envolve repositórios, issues, PRs ou actions. Com o GitHub conectado, a execução pode usar a conta autorizada.",
    });
  }

  if (!opts.vercelConnected && VERCEL_NEED.test(blob)) {
    out.push({
      provider: "vercel",
      displayName: "Vercel",
      status: "disconnected",
      reason:
        "O objetivo envolve projetos ou deployments na Vercel. Com a Vercel conectada, a execução pode listar e gerenciar projetos.",
    });
  }

  return out;
}
