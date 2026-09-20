from pathlib import Path
p = Path("apps/web/src/app/(app)/chat/page.tsx")
t = p.read_text()

if "redactSecrets" not in t:
    if 'import { MessageActions } from "@/components/chat/MessageActions";' in t:
        t = t.replace(
            'import { MessageActions } from "@/components/chat/MessageActions";',
            'import { MessageActions } from "@/components/chat/MessageActions";\nimport { redactSecrets } from "@/lib/security/credentials";',
            1,
        )
    else:
        t = t.replace(
            'import { StructuredMessage, type StructuredStep } from "@/components/chat/StructuredMessage";',
            'import { StructuredMessage, type StructuredStep } from "@/components/chat/StructuredMessage";\nimport { redactSecrets } from "@/lib/security/credentials";',
            1,
        )

old = """    const text = inputMessage.trim();
    if ((!text && pendingArtifacts.length === 0) || sending) return;
    if (text.length > 4000) {
      addToast("Mensagem excede 4.000 caracteres.", "error");
      return;
    }
    setError(null);
    setSuggestedPlan(null);
    setSuggestedConnectors([]);
    const activeArtifacts = [...pendingArtifacts];
    const displayContent =
      text ||
      (activeArtifacts.length > 0
        ? `[Arquivo anexado: ${activeArtifacts.map((a) => a.name).join(", ")}]`
        : "");
"""

new = """    const textRaw = inputMessage.trim();
    if ((!textRaw && pendingArtifacts.length === 0) || sending) return;
    if (textRaw.length > 4000) {
      addToast("Mensagem excede 4.000 caracteres.", "error");
      return;
    }
    const redacted = redactSecrets(textRaw);
    const text = redacted.text;
    if (redacted.hadSecrets) {
      addToast(
        "Credencial detectada e mascarada. Use Conectores para ligar APIs. Revogue a chave se vazou em texto claro.",
        "warning",
        "Seguranca"
      );
    }
    setError(null);
    setSuggestedPlan(null);
    setSuggestedConnectors([]);
    const activeArtifacts = [...pendingArtifacts];
    const displayContent =
      text ||
      (activeArtifacts.length > 0
        ? `[Arquivo anexado: ${activeArtifacts.map((a) => a.name).join(", ")}]`
        : "");
"""

if old not in t:
    raise SystemExit("handleSend block not found")
t = t.replace(old, new, 1)

old_ls = """            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setMessages(parsed);"""
new_ls = """            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              setMessages(
                parsed.map((m: Message) =>
                  m.role === "user" && typeof m.content === "string"
                    ? { ...m, content: redactSecrets(m.content).text }
                    : m
                )
              );
            }"""
if old_ls in t:
    t = t.replace(old_ls, new_ls, 1)

p.write_text(t)
print("page ok", len(t))
