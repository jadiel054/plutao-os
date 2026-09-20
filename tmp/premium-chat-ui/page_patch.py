from pathlib import Path
p = Path("apps/web/src/app/(app)/chat/page.tsx")
t = p.read_text()
if "ChatHistoryDrawer" not in t:
    t = t.replace(
        'import { Header } from "@/components/Header";',
        'import { Header } from "@/components/Header";\nimport { ChatHistoryDrawer } from "@/components/ChatHistoryDrawer";',
        1,
    )
if "isChatMenuOpen" not in t:
    t = t.replace(
        "const [abortController, setAbortController] = useState<AbortController | null>(null);",
        "const [abortController, setAbortController] = useState<AbortController | null>(null);\n  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);",
        1,
    )
old_h = '<Header userEmail={userEmail} onNotify={(msg, type) => addToast(msg, type)} />'
new_h = (
    "<>\n"
    "      <ChatHistoryDrawer\n"
    "        open={isChatMenuOpen}\n"
    "        onClose={() => setIsChatMenuOpen(false)}\n"
    "        userEmail={userEmail}\n"
    "        userInitial={(userEmail?.[0] || \"P\").toUpperCase()}\n"
    "        history={recentMissions.map((m) => ({\n"
    "          id: m.id,\n"
    "          title: m.objective.slice(0, 48) || \"Missão\",\n"
    "          subtitle: m.status,\n"
    "        }))}\n"
    "        onNewChat={() => {\n"
    "          setMessages([]);\n"
    "          setSuggestedPlan(null);\n"
    "          setSuggestedConnectors([]);\n"
    "          setError(null);\n"
    "          if (userEmail) localStorage.removeItem(`plutao_chat_${userEmail}`);\n"
    "        }}\n"
    "        onSelectHistory={(id) => selectMission(id)}\n"
    "      />\n"
    "      <Header\n"
    "        userEmail={userEmail}\n"
    "        onNotify={(msg, type) => addToast(msg, type)}\n"
    "        variant=\"chat\"\n"
    "        onOpenMenu={() => setIsChatMenuOpen(true)}\n"
    "        onNewChat={() => {\n"
    "          setMessages([]);\n"
    "          setSuggestedPlan(null);\n"
    "          setSuggestedConnectors([]);\n"
    "          setError(null);\n"
    "          if (userEmail) localStorage.removeItem(`plutao_chat_${userEmail}`);\n"
    "        }}\n"
    "      />\n"
    "    </>"
)
if old_h not in t:
    raise SystemExit("Header line not found")
t = t.replace(old_h, new_h, 1)
p.write_text(t)
print("page patched", p.stat().st_size)
