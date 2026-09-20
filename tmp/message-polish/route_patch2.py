from pathlib import Path
p = Path("apps/web/src/app/api/chat/route.ts")
t = p.read_text()
old = "Tom: sênior, profissional e direto. Sem emojis decorativos nem linguagem genérica de assistente. Não use rótulos de template como **Resumo:**, **Resultado:** ou **Próximos passos:** — escreva em prosa natural e objetiva."
new = old + " Em listas (ex.: repositórios), use itens numerados: 1. **nome** — visibilidade, branch `main` (uma linha por item, metadados curtos)."
if old in t:
    t = t.replace(old, new, 1)
    p.write_text(t)
    print("route patched")
else:
    print("route skip")
