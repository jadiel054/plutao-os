#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const route = path.join(root, "apps/web/src/app/api/chat/route.ts");
const page = path.join(root, "apps/web/src/app/(app)/chat/page.tsx");

let r = fs.readFileSync(route, "utf8");
let p = fs.readFileSync(page, "utf8");

if (!r.includes('from "@/lib/chat/buildFollowUps"')) {
  r = r.replace(
    'import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";',
    'import { detectSuggestedConnectors } from "@/lib/chat/suggestConnectors";\nimport { buildFollowUps } from "@/lib/chat/buildFollowUps";'
  );
  console.log("added import");
}

const fuDef =
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
  "            });\n\n";

// Stream: after suggestedConnectors block, before toolTraces
if (!r.includes("const suggestedFollowUps = buildFollowUps")) {
  const anchor =
    "            const suggestedConnectors = detectSuggestedConnectors({\n" +
    "              lastUserText,\n" +
    "              assistantText: assistantContent,\n" +
    "              githubConnected: connectorSnap.githubConnected,\n" +
    "              vercelConnected: connectorSnap.vercelConnected,\n" +
    "            });\n\n" +
    "            const toolTraces = [];";
  if (!r.includes(anchor)) {
    console.error("stream anchor missing");
    process.exit(1);
  }
  r = r.replace(
    anchor,
    "            const suggestedConnectors = detectSuggestedConnectors({\n" +
      "              lastUserText,\n" +
      "              assistantText: assistantContent,\n" +
      "              githubConnected: connectorSnap.githubConnected,\n" +
      "              vercelConnected: connectorSnap.vercelConnected,\n" +
      "            });\n\n" +
      fuDef +
      "            const toolTraces = [];"
  );
  console.log("stream define ok");

  const anchor2 =
    "    const suggestedConnectors = detectSuggestedConnectors({\n" +
    "      lastUserText,\n" +
    "      assistantText: assistantContent,\n" +
    "      githubConnected: connectorSnap.githubConnected,\n" +
    "      vercelConnected: connectorSnap.vercelConnected,\n" +
    "    });\n\n" +
    "    const toolTraces = [];\n" +
    "    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);";
  if (!r.includes(anchor2)) {
    console.error("nonstream anchor missing");
    process.exit(1);
  }
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
  r = r.replace(
    anchor2,
    "    const suggestedConnectors = detectSuggestedConnectors({\n" +
      "      lastUserText,\n" +
      "      assistantText: assistantContent,\n" +
      "      githubConnected: connectorSnap.githubConnected,\n" +
      "      vercelConnected: connectorSnap.vercelConnected,\n" +
      "    });\n\n" +
      fuNon +
      "    const toolTraces = [];\n" +
      "    if (toolRunRes.github.trace) toolTraces.push(toolRunRes.github.trace);"
  );
  console.log("nonstream define ok");
}

fs.writeFileSync(route, r);

// page
if (!p.includes("FollowUpChips")) {
  if (!p.includes('from "@/components/chat/FollowUpChips"')) {
    p = p.replace(
      'import { MessageActions } from "@/components/chat/MessageActions";',
      'import { MessageActions } from "@/components/chat/MessageActions";\nimport { FollowUpChips, type FollowUpChip } from "@/components/chat/FollowUpChips";'
    );
  }
  if (!p.includes("suggestedFollowUps")) {
    p = p.replace(
      "  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([]);",
      "  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([])\n  const [suggestedFollowUps, setSuggestedFollowUps] = useState<FollowUpChip[]>([]);"
    );
    p = p.replace(
      "  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors]);",
      "  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors, suggestedFollowUps]);"
    );
    // clear on send - may already have been partially done
    if (!p.includes("setSuggestedFollowUps([])")) {
      p = p.replace(
        "    setSuggestedPlan(null);\n    setSuggestedConnectors([]);",
        "    setSuggestedPlan(null);\n    setSuggestedConnectors([]);\n    setSuggestedFollowUps([]);"
      );
    }
  }

  // SSE parse
  if (!p.includes("parsed.suggestedFollowUps")) {
    const needle = '              } else if (eventName === "error") {';
    const insert =
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
      needle;
    if (!p.includes(needle)) {
      console.error("SSE needle missing");
      process.exit(1);
    }
    p = p.replace(needle, insert);
    console.log("SSE ok");
  }

  // UI
  if (!p.includes("<FollowUpChips")) {
    const uiNeedle = "            <div ref={messagesEndRef} />";
    const uiBlock =
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
      uiNeedle;
    if (!p.includes(uiNeedle)) {
      console.error("UI needle missing");
      process.exit(1);
    }
    p = p.replace(uiNeedle, uiBlock);
    console.log("UI ok");
  }
}

fs.writeFileSync(page, p);
console.log("fix-followups-wire done");
