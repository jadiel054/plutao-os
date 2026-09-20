from pathlib import Path
p = Path("apps/web/src/app/(app)/chat/page.tsx")
t = p.read_text()

if "MessageActions" not in t:
    t = t.replace(
        'import { StructuredMessage, type StructuredStep } from "@/components/chat/StructuredMessage";',
        'import { StructuredMessage, type StructuredStep } from "@/components/chat/StructuredMessage";\nimport { MessageActions } from "@/components/chat/MessageActions";',
        1,
    )

if "async function regenerateLast" not in t:
    anchor = "  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {"
    if anchor not in t:
        raise SystemExit("handleKeyDown not found")
    fn = (
        "  async function regenerateLast() {\n"
        "    if (sending) return;\n"
        "    const lastUser = [...messages].reverse().find((x) => x.role === \"user\");\n"
        "    if (!lastUser) return;\n"
        "    setMessages((prev) => {\n"
        "      const next = [...prev];\n"
        "      while (next.length && next[next.length - 1]?.role === \"assistant\") next.pop();\n"
        "      return next;\n"
        "    });\n"
        "    setInputMessage(lastUser.content);\n"
        "    setTimeout(() => {\n"
        "      const ta = textareaRef.current;\n"
        "      if (ta) ta.closest(\"form\")?.requestSubmit();\n"
        "    }, 40);\n"
        "  }\n\n"
    )
    t = t.replace(anchor, fn + anchor, 1)

needle = 'isStreaming={sending && m.role === "assistant" && m.id === messages[messages.length - 1]?.id}'
pos = t.find(needle)
if pos < 0:
    pos = t.find("isStreaming={sending")
if pos < 0:
    raise SystemExit("isStreaming not found")
close = t.find("/>", pos)
if close < 0:
    raise SystemExit("SM close not found")
chunk = t[close:close+500]
if "MessageActions" not in chunk:
    inject = (
        "\n                  {m.role === \"assistant\" && m.content.trim() ? (\n"
        "                    <MessageActions\n"
        "                      content={m.content}\n"
        "                      disabled={sending}\n"
        "                      onRegenerate={() => void regenerateLast()}\n"
        "                    />\n"
        "                  ) : null}"
    )
    t = t[: close + 2] + inject + t[close + 2 :]

p.write_text(t)
print("page ok", len(t))
