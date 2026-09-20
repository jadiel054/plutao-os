"use client";

/**
 * Tipografia leve para respostas do Núcleo: negrito, código inline e listas numeradas
 * com visual de produto (não bloco markdown "seco").
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-3 text-[14.5px] leading-relaxed text-[var(--text-primary)]">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trimEnd());
        const listItems = lines.filter((l) => /^\d+\.\s+/.test(l.trim()));
        const isNumberedList = listItems.length >= 2 && listItems.length >= lines.length - 1;

        if (isNumberedList) {
          return (
            <ul key={bi} className="rounded-2xl border border-[var(--border)] bg-[var(--base)]/35 overflow-hidden divide-y divide-[var(--border)]/70">
              {listItems.map((line, i) => {
                const raw = line.replace(/^\d+\.\s+/, "");
                const m = raw.match(/^\*\*(.+?)\*\*\s*[—–\-:]\s*(.*)$/);
                const name = m ? m[1] : raw.replace(/\*\*/g, "");
                const meta = m ? m[2] : "";
                return (
                  <li key={i} className="flex items-start gap-3 px-3.5 py-2.5">
                    <span className="mt-0.5 w-5 h-5 rounded-md bg-[var(--selo)]/10 text-[var(--selo)] text-[10px] font-mono flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[13.5px] tracking-tight truncate">{stripMd(name)}</p>
                      {meta ? (
                        <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5 leading-snug">{stripMd(meta)}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p key={bi} className="whitespace-pre-wrap">
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 ? "\n" : null}
                <InlineMd text={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function stripMd(s: string) {
  return s.replace(/\*\*/g, "").replace(/`([^`]+)`/g, "$1");
}

function InlineMd({ text }: { text: string }) {
  const parts: Array<{ t: "text" | "bold" | "code"; v: string }> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith("**")) parts.push({ t: "bold", v: token.slice(2, -2) });
    else parts.push({ t: "code", v: token.slice(1, -1) });
    last = m.index + token.length;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });
  if (parts.length === 0) parts.push({ t: "text", v: text });

  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "bold") return <strong key={i} className="font-semibold text-[var(--text-primary)]">{p.v}</strong>;
        if (p.t === "code")
          return (
            <code key={i} className="px-1 py-0.5 rounded-md bg-[var(--base)] border border-[var(--border)] font-mono text-[12px] text-[var(--selo)]">
              {p.v}
            </code>
          );
        return <span key={i}>{p.v}</span>;
      })}
    </>
  );
}
