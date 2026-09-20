from pathlib import Path
p = Path("apps/web/src/app/api/chat/route.ts")
t = p.read_text()

if 'from "@/lib/security/credentials"' not in t:
    t = t.replace(
        'import { buildReasoningSteps } from "@/lib/chat/buildReasoningSteps";',
        'import { buildReasoningSteps } from "@/lib/chat/buildReasoningSteps";\nimport { redactSecrets, secretExposureNotice } from "@/lib/security/credentials";',
        1,
    )

anchor = """    for (const msg of history) {
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: "Mensagem excede o limite permitido (máximo 4000 caracteres)" },
          { status: 400 }
        );
      }
    }"""

insert = """    let secretsExposed = false;
    history = history.map((msg) => {
      const r = redactSecrets(msg.content);
      if (r.hadSecrets) secretsExposed = true;
      return { ...msg, content: r.text };
    });

    for (const msg of history) {
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: "Mensagem excede o limite permitido (máximo 4000 caracteres)" },
          { status: 400 }
        );
      }
    }"""

if "secretsExposed" not in t:
    if anchor not in t:
        raise SystemExit("history length check not found")
    t = t.replace(anchor, insert, 1)

security = """

SEGURANCA DE CREDENCIAIS:
- Tokens e API keys de conectores (GitHub, Vercel, Neon, Render, Stripe, Exa) sao dados sensiveis. Nunca peca para colar secret no chat; oriente a usar Configuracoes > Conectores.
- Se o usuario colar uma chave no chat, o sistema ja mascara (ex.: sk_live_****abcd). Nao repita o valor completo, nao grave em artefatos, nao ecoe na resposta.
- Ao concluir tarefa em que credencial pode ter vazado no historico, lembre em uma frase: revogue a chave no painel do provedor se foi exposta em texto claro.
- Prefira o token ja conectado no runtime em vez de qualquer string colada pelo usuario."""

if "SEGURANCA DE CREDENCIAIS" not in t:
    idx = t.find("Tom: sênior")
    if idx < 0:
        idx = t.find("Tom: senior")
    if idx < 0:
        raise SystemExit("tom not found")
    line_end = t.find("\n", idx)
    t = t[:line_end] + security + t[line_end:]

needle = """    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");"""
addon = """    const systemPromptFinal = secretsExposed
      ? systemPrompt +
        "\\n\\nAVISO RUNTIME: " +
        secretExposureNotice([{ kind: "exposta_no_chat", masked: "****", start: 0, end: 0 }])
      : systemPrompt;

    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");"""

if "systemPromptFinal" not in t and needle in t:
    t = t.replace(needle, addon, 1)
    t = t.replace('{ role: "system", content: systemPrompt }', '{ role: "system", content: systemPromptFinal }')
    t = t.replace("content: systemPrompt\n", "content: systemPromptFinal\n")

p.write_text(t)
print("route ok", len(t))
print("systemPromptFinal", "systemPromptFinal" in t)
