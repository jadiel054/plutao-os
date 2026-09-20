#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function must(file, oldStr, newStr, label) {
  if (!fs.existsSync(file)) throw new Error("missing " + file);
  let t = fs.readFileSync(file, "utf8");
  const marker = newStr.trim().slice(0, 50);
  if (marker && t.includes(marker)) {
    console.log("skip " + label);
    return false;
  }
  if (!t.includes(oldStr)) {
    console.error("FAIL " + label + ": anchor not found");
    process.exitCode = 1;
    return false;
  }
  t = t.replace(oldStr, newStr);
  fs.writeFileSync(file, t);
  console.log("ok " + label);
  return true;
}

const root = path.join(__dirname, "..");
const route = path.join(root, "apps/web/src/app/api/chat/route.ts");
const page = path.join(root, "apps/web/src/app/(app)/chat/page.tsx");

must(
  route,
  'import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";',
  'import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";\nimport { buildFollowUps } from "@/lib/chat/buildFollowUps";',
  "route import"
);

must(
  route,
  "Tom: sênior, profissional e direto.",
  "Após listar projetos/repositórios com tool de conector: em 1–2 frases, destaque o item mais relevante (ex.: plutao-os ou o mais recente) e convide o usuário a ir a fundo — sem listas genéricas de 'próximos passos'.\n\nTom: sênior, profissional e direto.",
  "route engagement"
);

const fuStream =
  "            const suggestedFollowUps = buildFollowUps({\n" +
  "              lastUserText,\n" +
  "              assistantText: assistantContent,\n" +
  "              tools: [\n" +
  "                toolRunRes.github.executed && toolRunRes.github.trace\n" +
  "                  ? {\n" +
  "                      provider: \"github\",\n" +
  "                      capability: toolRunRes.github.capability,\n" +
  "                      status: toolRunRes.github.trace.status,\n" +
  "                      outputSnippet: toolRunRes.github.trace.output,\n" +
  "                    }\n" +
  "                  : null,\n" +
  "                toolRunRes.vercel.executed && toolRunRes.vercel.trace\n" +
  "                  ? {\n" +
  "                      provider: \"vercel\",\n" +
  "                      capability: toolRunRes.vercel.capability,\n" +
  "                      status: toolRunRes.vercel.trace.status,\n" +
  "                      outputSnippet: toolRunRes.vercel.trace.output,\n" +
  "                    }\n" +
  "                  : null,\n" +
  "              ].filter(Boolean) as Array<{\n" +
  "                provider: string;\n" +
  "                capability?: string;\n" +
  "                status?: string;\n" +
  "                outputSnippet?: string;\n" +
  "              }>,\n" +
  "            });\n";

must(
  route,
  "            const suggestedConnectors = detectSuggestedConnectors({\n" +
    "              lastUserText,\n" +
    "              assistantText: assistantContent,\n" +
    "              githubConnected: connectorSnap.githubConnected,\n" +
    "              vercelConnected: connectorSnap.vercelConnected,\n" +
    "            });\n\n" +
    "            const toolTraces = [];",
  "            const suggestedConnectors = detectSuggestedConnectors({\n" +
    "              lastUserText,\n" +
    "              assistantText: assistantContent,\n" +
    "              githubConnected: connectorSnap.githubConnected,\n" +
    "              vercelConnected: connectorSnap.vercelConnected,\n" +
    "            });\n" +
    fuStream +
    "\n            const toolTraces = [];",
  "route stream fu"
);

must(
  route,
  "              suggestedConnectors,\n" +
    "              missionId,\n" +
    "              connectors: {\n" +
    "                github: connectorSnap.githubConnected,\n" +
    "                vercel: connectorSnap.vercelConnected,\n" +
    "              },",
  "              suggestedConnectors,\n" +
    "              suggestedFollowUps,\n" +
    "              missionId,\n" +
    "              connectors: {\n" +
    "                github: connectorSnap.githubConnected,\n" +
    "                vercel: connectorSnap.vercelConnected,\n" +
    "              },",
  "route stream emit"
);

const fuNon =
  "    const suggestedFollowUps = buildFollowUps({\n" +
  "      lastUserText,\n" +
  "      assistantText: assistantContent,\n" +
  "      tools: [\n" +
  "        toolRunRes.github.executed && toolRunRes.github.trace\n" +
  "          ? {\n" +
  "              provider: \"github\",\n" +
  "              capability: toolRunRes.github.capability,\n" +
  "              status: toolRunRes.github.trace.status,\n" +
  "              outputSnippet: toolRunRes.github.trace.output,\n" +
  "            }\n" +
  "          : null,\n" +
  "        toolRunRes.vercel.executed && toolRunRes.vercel.trace\n" +
  "          ? {\n" +
  "              provider: \"vercel\",\n" +
  "              capability: toolRunRes.vercel.capability,\n" +
  "              status: toolRunRes.vercel.trace.status,\n" +
  "              outputSnippet: toolRunRes.vercel.trace.output,\n" +
  "            }\n" +
  "          : null,\n" +
  "      ].filter(Boolean) as Array<{\n" +
  "        provider: string;\n" +
  "        capability?: string;\n" +
  "        status?: string;\n" +
  "        outputSnippet?: string;\n" +
  "      }>,\n" +
  "    });\n\n";

must(
  route,
  "    const suggestedConnectors = detectSuggestedConnectors({\n" +
    "      lastUserText,\n" +
    "      assistantText: assistantContent,\n" +
    "      githubConnected: connectorSnap.githubConnected,\n" +
    "      vercelConnected: connectorSnap.vercelConnected,\n" +
    "    });\n\n" +
    "    const toolTraces = [];\n" +
    "    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);",
  "    const suggestedConnectors = detectSuggestedConnectors({\n" +
    "      lastUserText,\n" +
    "      assistantText: assistantContent,\n" +
    "      githubConnected: connectorSnap.githubConnected,\n" +
    "      vercelConnected: connectorSnap.vercelConnected,\n" +
    "    });\n\n" +
    fuNon +
    "    const toolTraces = [];\n" +
    "    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);",
  "route nonstream fu"
);

must(
  route,
  "      suggestedConnectors,\n" +
    "      missionId,\n" +
    "      connectors: {\n" +
    "        github: connectorSnap.githubConnected,\n" +
    "        vercel: connectorSnap.vercelConnected,\n" +
    "      },\n" +
    "      steps: steps.length > 0 ? steps : undefined,\n" +
    "      trace,\n" +
    "    });",
  "      suggestedConnectors,\n" +
    "      suggestedFollowUps,\n" +
    "      missionId,\n" +
    "      connectors: {\n" +
    "        github: connectorSnap.githubConnected,\n" +
    "        vercel: connectorSnap.vercelConnected,\n" +
    "      },\n" +
    "      steps: steps.length > 0 ? steps : undefined,\n" +
    "      trace,\n" +
    "    });",
  "route nonstream json"
);

must(
  page,
  'import { MessageActions } from "@/components/chat/MessageActions";',
  'import { MessageActions } from "@/components/chat/MessageActions";\nimport { FollowUpChips, type FollowUpChip } from "@/components/chat/FollowUpChips";',
  "page import"
);

must(
  page,
  "  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([]);",
  "  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([])\n  const [suggestedFollowUps, setSuggestedFollowUps] = useState<FollowUpChip[]>([]);",
  "page state"
);

must(
  page,
  "  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors]);",
  "  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors, suggestedFollowUps]);",
  "page scroll"
);

must(
  page,
  "    setSuggestedPlan(null);\n    setSuggestedConnectors([]);",
  "    setSuggestedPlan(null);\n    setSuggestedConnectors([]);\n    setSuggestedFollowUps([]);",
  "page clear"
);

must(
  page,
  "  async function handleSend(e?: FormEvent) {\n    if (e) e.preventDefault();\n    const textRaw = inputMessage.trim();",
  "  async function handleSend(e?: FormEvent, overrideText?: string) {\n    if (e) e.preventDefault();\n    const textRaw = (overrideText ?? inputMessage).trim();",
  "page handleSend"
);

const sseOld =
  "                if (Array.isArray(parsed.suggestedConnectors) && parsed.suggestedConnectors.length > 0) {\n" +
  "                  setSuggestedConnectors(\n" +
  "                    parsed.suggestedConnectors\n" +
  "                      .filter((c: unknown): c is Record<string, unknown> => typeof c === \"object\" && c !== null)\n" +
  "                      .map((c: Record<string, unknown>) => ({\n" +
  "                        provider: String(c.provider ?? \"\"),\n" +
  "                        displayName: String(c.displayName ?? c.provider ?? \"\"),\n" +
  "                        status: String(c.status ?? \"disconnected\"),\n" +
  "                        reason: c.reason ? String(c.reason) : undefined,\n" +
  "                      }))\n" +
  "                      .filter((c: SuggestedConnector) => c.provider.length > 0)\n" +
  "                  );\n" +
  "                }\n" +
  "              } else if (eventName === \"error\") {";

const sseNew =
  sseOld.replace(
    "              } else if (eventName === \"error\") {",
    "                if (Array.isArray(parsed.suggestedFollowUps) && parsed.suggestedFollowUps.length > 0) {\n" +
      "                  setSuggestedFollowUps(\n" +
      "                    parsed.suggestedFollowUps\n" +
      "                      .filter((f: unknown): f is Record<string, unknown> => typeof f === \"object\" && f !== null)\n" +
      "                      .map((f: Record<string, unknown>, i: number) => ({\n" +
      "                        id: String(f.id ?? (\"fu-\" + i)),\n" +
      "                        label: String(f.label ?? \"\"),\n" +
      "                        prompt: String(f.prompt ?? \"\"),\n" +
      "                      }))\n" +
      "                      .filter((f: FollowUpChip) => f.label.length > 0 && f.prompt.length > 0)\n" +
      "                  );\n" +
      "                }\n" +
      "              } else if (eventName === \"error\") {"
  );

must(page, sseOld, sseNew, "page SSE");

const uiOld =
  "            {suggestedConnectors.length > 0 ? (\n" +
  "              <div className=\"flex justify-start\">\n" +
  "                <ConnectorActionCard\n" +
  "                  items={suggestedConnectors}\n" +
  "                  onDismiss={() => setSuggestedConnectors([])}\n" +
  "                  onNotify={(msg, type) => addToast(msg, type ?? \"info\")}\n" +
  "                  onOpenManage={() => {\n" +
  "                    setSuggestedConnectors([]);\n" +
  "                    setIsConnectorsSheetOpen(true);\n" +
  "                  }}\n" +
  "                />\n" +
  "              </div>\n" +
  "            ) : null}\n\n" +
  "            <div ref={messagesEndRef} />";

const uiNew =
  "            {suggestedConnectors.length > 0 ? (\n" +
  "              <div className=\"flex justify-start\">\n" +
  "                <ConnectorActionCard\n" +
  "                  items={suggestedConnectors}\n" +
  "                  onDismiss={() => setSuggestedConnectors([])}\n" +
  "                  onNotify={(msg, type) => addToast(msg, type ?? \"info\")}\n" +
  "                  onOpenManage={() => {\n" +
  "                    setSuggestedConnectors([]);\n" +
  "                    setIsConnectorsSheetOpen(true);\n" +
  "                  }}\n" +
  "                />\n" +
  "              </div>\n" +
  "            ) : null}\n\n" +
  "            {suggestedFollowUps.length > 0 ? (\n" +
  "              <FollowUpChips\n" +
  "                items={suggestedFollowUps}\n" +
  "                disabled={sending}\n" +
  "                onDismiss={() => setSuggestedFollowUps([])}\n" +
  "                onSelect={(prompt) => {\n" +
  "                  setSuggestedFollowUps([]);\n" +
  "                  void handleSend(undefined, prompt);\n" +
  "                }}\n" +
  "              />\n" +
  "            ) : null}\n\n" +
  "            <div ref={messagesEndRef} />";

must(page, uiOld, uiNew, "page UI");

console.log("patch-followups done");
