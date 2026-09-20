#!/usr/bin/env node
/**
 * Aplica follow-ups no route.ts e chat/page.tsx de forma idempotente.
 */
const fs = require("fs");
const path = require("path");

function must(file, oldStr, newStr, label) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  let t = fs.readFileSync(file, "utf8");
  if (t.includes(newStr.trim().slice(0, 40))) {
    console.log(`skip ${label} (already applied)`);
    return false;
  }
  if (!t.includes(oldStr)) {
    console.error(`FAIL ${label}: anchor not found`);
    process.exitCode = 1;
    return false;
  }
  t = t.replace(oldStr, newStr);
  fs.writeFileSync(file, t);
  console.log(`ok ${label}`);
  return true;
}

const root = path.join(__dirname, "..");
const route = path.join(root, "apps/web/src/app/api/chat/route.ts");
const page = path.join(root, "apps/web/src/app/(app)/chat/page.tsx");

// --- route.ts ---
must(
  route,
  'import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";',
  'import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";\nimport { buildFollowUps } from "@/lib/chat/buildFollowUps";',
  "route import buildFollowUps"
);

// system prompt engagement tip (once)
must(
  route,
  "Tom: sênior, profissional e direto.",
  "Após listar projetos/repositórios com tool de conector: em 1–2 frases, destaque o item mais relevante (ex.: plutao-os ou o mais recente) e convide o usuário a ir a fundo — sem listas genéricas de 'próximos passos'.\n\nTom: sênior, profissional e direto.",
  "route engagement prompt"
);

const followUpBlock = `
            const suggestedFollowUps = buildFollowUps({
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
`;

// Stream path: after suggestedConnectors, before emit done — insert follow-ups
must(
  route,
  `            const suggestedConnectors = detectSuggestedConnectors({
              lastUserText,
              assistantText: assistantContent,
              githubConnected: connectorSnap.githubConnected,
              vercelConnected: connectorSnap.vercelConnected,
            });

            const toolTraces = [];`,
  `            const suggestedConnectors = detectSuggestedConnectors({
              lastUserText,
              assistantText: assistantContent,
              githubConnected: connectorSnap.githubConnected,
              vercelConnected: connectorSnap.vercelConnected,
            });
${followUpBlock}
            const toolTraces = [];`,
  "route stream followUps"
);

must(
  route,
  `              suggestedConnectors,
              missionId,
              connectors: {
                github: connectorSnap.githubConnected,
                vercel: connectorSnap.vercelConnected,
              },`,
  `              suggestedConnectors,
              suggestedFollowUps,
              missionId,
              connectors: {
                github: connectorSnap.githubConnected,
                vercel: connectorSnap.vercelConnected,
              },`,
  "route stream emit followUps"
);

// Non-stream path
must(
  route,
  `    const suggestedConnectors = detectSuggestedConnectors({
      lastUserText,
      assistantText: assistantContent,
      githubConnected: connectorSnap.githubConnected,
      vercelConnected: connectorSnap.vercelConnected,
    });

    const toolTraces = [];
    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);`,
  `    const suggestedConnectors = detectSuggestedConnectors({
      lastUserText,
      assistantText: assistantContent,
      githubConnected: connectorSnap.githubConnected,
      vercelConnected: connectorSnap.vercelConnected,
    });

    const suggestedFollowUps = buildFollowUps({
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

    const toolTraces = [];
    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);`,
  "route nonstream followUps"
);

must(
  route,
  `      suggestedConnectors,
      missionId,
      connectors: {
        github: connectorSnap.githubConnected,
        vercel: connectorSnap.vercelConnected,
      },
      steps: steps.length > 0 ? steps : undefined,
      trace,
    });`,
  `      suggestedConnectors,
      suggestedFollowUps,
      missionId,
      connectors: {
        github: connectorSnap.githubConnected,
        vercel: connectorSnap.vercelConnected,
      },
      steps: steps.length > 0 ? steps : undefined,
      trace,
    });`,
  "route nonstream json followUps"
);

// --- page.tsx ---
must(
  page,
  'import { MessageActions } from "@/components/chat/MessageActions";',
  'import { MessageActions } from "@/components/chat/MessageActions";\nimport { FollowUpChips, type FollowUpChip } from "@/components/chat/FollowUpChips";',
  "page import FollowUpChips"
);

must(
  page,
  "  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([]);",
  "  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([])\n  const [suggestedFollowUps, setSuggestedFollowUps] = useState<FollowUpChip[]>([]);",
  "page state followUps"
);

must(
  page,
  "  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors]);",
  "  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors, suggestedFollowUps]);",
  "page scroll followUps"
);

must(
  page,
  "    setSuggestedPlan(null);\n    setSuggestedConnectors([]);",
  "    setSuggestedPlan(null);\n    setSuggestedConnectors([]);\n    setSuggestedFollowUps([]);",
  "page clear followUps on send"
);

console.log("patch-followups done");
