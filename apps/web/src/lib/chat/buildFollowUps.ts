/**
 * Follow-ups determinísticos após execução de tools de conectores.
 * Chips clicáveis no chat (enviam a mensagem como usuário).
 */

export type SuggestedFollowUp = {
  id: string;
  label: string;
  /** Texto enviado ao chat quando o usuário toca no chip */
  prompt: string;
};

type ToolHint = {
  provider?: string;
  capability?: string;
  status?: string;
  outputSnippet?: string;
};

function extractProjectNames(snippet: string): string[] {
  const names: string[] = [];
  // **name** lines from formatted tool output
  const re = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet)) !== null) {
    const n = m[1].trim();
    if (n && n.length < 64 && !names.includes(n)) names.push(n);
    if (names.length >= 5) break;
  }
  return names;
}

function extractRepoNames(snippet: string): string[] {
  return extractProjectNames(snippet);
}

/**
 * Gera 2–4 follow-ups úteis com base no que a tool acabou de fazer.
 */
export function buildFollowUps(opts: {
  lastUserText: string;
  assistantText: string;
  tools?: ToolHint[];
}): SuggestedFollowUp[] {
  const out: SuggestedFollowUp[] = [];
  const push = (label: string, prompt: string) => {
    if (out.length >= 4) return;
    if (out.some((x) => x.prompt === prompt)) return;
    out.push({
      id: `fu-${out.length + 1}`,
      label,
      prompt,
    });
  };

  const tools = opts.tools ?? [];
  const vercelList = tools.find(
    (t) =>
      t.provider === "vercel" &&
      t.status === "ok" &&
      (t.capability === "projects_list" || t.capability === "deployments_list")
  );
  const githubList = tools.find(
    (t) =>
      t.provider === "github" &&
      t.status === "ok" &&
      (t.capability === "repos_list" || t.capability === "repo_get")
  );

  if (vercelList) {
    const names = extractProjectNames(vercelList.outputSnippet || "");
    const primary = names.find((n) => /plutao/i.test(n)) || names[0];

    if (vercelList.capability === "projects_list") {
      push(
        primary ? `Último deploy de ${primary}` : "Ver deployments recentes",
        primary
          ? `Mostre os deployments recentes do projeto ${primary} na Vercel, com status e URL.`
          : "Liste os deployments recentes na minha conta Vercel."
      );
      if (primary) {
        push(
          `Ir a fundo em ${primary}`,
          `Quero ir a fundo no projeto ${primary} na Vercel: status do último deploy, framework e próximos passos úteis.`
        );
      }
      if (names.length > 1) {
        const second = names.find((n) => n !== primary) || names[1];
        push(
          `Detalhes de ${second}`,
          `Detalhe o projeto ${second} na Vercel e diga se o último deploy está ok.`
        );
      }
      push(
        "Comparar projetos ativos",
        "Dos projetos listados na Vercel, quais parecem ativos recentemente e quais eu deveria priorizar?"
      );
    }

    if (vercelList.capability === "deployments_list") {
      push(
        "Inspecionar falha de deploy",
        "Se algum deployment falhou, mostre qual e o que inspecionar primeiro."
      );
      push(
        "Voltar à lista de projetos",
        "Liste de novo os meus projetos na Vercel."
      );
    }
  }

  if (githubList) {
    const names = extractRepoNames(githubList.outputSnippet || "");
    const primary = names.find((n) => /plutao/i.test(n)) || names[0];
    push(
      primary ? `Issues de ${primary}` : "Listar issues abertas",
      primary
        ? `Liste as issues abertas do repositório ${primary}.`
        : "Liste issues abertas nos meus repositórios principais."
    );
    if (primary) {
      push(
        `PRs de ${primary}`,
        `Liste pull requests abertos em ${primary}.`
      );
      push(
        `Actions de ${primary}`,
        `Mostre os workflows recentes do GitHub Actions em ${primary}.`
      );
    }
  }

  // Fallback genérico se tools rodaram mas sem caso específico
  if (out.length === 0 && tools.some((t) => t.status === "ok")) {
    push(
      "Próximo passo útil",
      "Com base no que você acabou de mostrar, o que faz mais sentido eu fazer agora?"
    );
  }

  return out;
}
