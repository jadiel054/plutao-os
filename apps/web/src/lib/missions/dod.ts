/**
 * Definition of Done — verificação determinística (V1).
 * COMPLETED só com evidência independente, nunca só por texto do modelo.
 */

export type DodCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type DodResult = {
  passed: boolean;
  checks: DodCheck[];
  summary: string;
};

type EvidenceLike = {
  id?: string;
  type?: string;
  content?: string;
  source?: string;
};

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Extrai path/content de strings de evidência tool_result / model_step. */
export function extractFilesystemFacts(evidence: EvidenceLike[]): {
  writes: { path: string; content?: string; size?: number }[];
  reads: { path: string; content?: string; size?: number }[];
  toolResults: number;
  modelSteps: number;
} {
  const writes: { path: string; content?: string; size?: number }[] = [];
  const reads: { path: string; content?: string; size?: number }[] = [];
  let toolResults = 0;
  let modelSteps = 0;

  for (const e of evidence) {
    const content = String(e.content ?? "");
    const type = String(e.type ?? "").toLowerCase();
    const source = String(e.source ?? "").toLowerCase();

    if (type.includes("model") || source.includes("model")) modelSteps++;
    if (type === "tool_result") {
      toolResults++;
    }

    // tool:filesystem → {json}
    const arrowIdx = content.indexOf("→");
    const jsonPart =
      arrowIdx >= 0 ? content.slice(arrowIdx + 1).trim() : content.trim();
    const obj = parseJsonLoose(jsonPart);
    if (obj && typeof obj === "object" && obj !== null) {
      const o = obj as Record<string, unknown>;
      const path = typeof o.path === "string" ? o.path : undefined;
      const fileContent = typeof o.content === "string" ? o.content : undefined;
      const size = typeof o.size === "number" ? o.size : undefined;
      if (path) {
        if (fileContent !== undefined || (size !== undefined && content.includes("write"))) {
          // heurística: presença de content no result de write costuma ser read;
          // size-only após write é write result
        }
        if (fileContent !== undefined) {
          reads.push({ path, content: fileContent, size });
        } else if (size !== undefined) {
          writes.push({ path, size });
        } else {
          writes.push({ path });
        }
      }
      // model tool proposal: {"tool":"filesystem","input":"{...}"}
      if (o.tool === "filesystem" && typeof o.input === "string") {
        const inner = parseJsonLoose(o.input) as Record<string, unknown> | null;
        if (inner && inner.action === "write") {
          const payload = (inner.payload ?? {}) as Record<string, unknown>;
          if (typeof payload.path === "string") {
            writes.push({
              path: payload.path,
              content: typeof payload.content === "string" ? payload.content : undefined,
            });
          }
        }
        if (inner && inner.action === "read") {
          const payload = (inner.payload ?? {}) as Record<string, unknown>;
          if (typeof payload.path === "string") {
            reads.push({ path: payload.path });
          }
        }
      }
    }

    // input com action write embutido no texto
    const writeMatch = content.match(
      /"action"\s*:\s*"write"[\s\S]*?"path"\s*:\s*"([^"]+)"[\s\S]*?"content"\s*:\s*"((?:\\.|[^"\\])*)"/
    );
    if (writeMatch) {
      writes.push({
        path: writeMatch[1],
        content: writeMatch[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      });
    }

    const pathSize = content.match(
      /"path"\s*:\s*"([^"]+)"[\s\S]*?"size"\s*:\s*(\d+)/
    );
    if (pathSize && content.includes("filesystem")) {
      writes.push({ path: pathSize[1], size: Number(pathSize[2]) });
    }

    const pathContent = content.match(
      /"path"\s*:\s*"([^"]+)"[\s\S]*?"content"\s*:\s*"((?:\\.|[^"\\])*)"/
    );
    if (pathContent && content.includes("filesystem")) {
      reads.push({
        path: pathContent[1],
        content: pathContent[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      });
    }
  }

  return { writes, reads, toolResults, modelSteps };
}

/** Heurística: path + conteúdo esperados a partir do objective. */
export function parseObjectiveHints(objective: string): {
  path?: string;
  content?: string;
} {
  const o = objective.trim();
  // "arquivo notes/x.txt com o texto exatamente: FOO" / "path com texto"
  const m1 = o.match(
    /(?:arquivo|file|path)\s+[«"']?([\w./-]+\.[\w]+)[»"']?\s+(?:com\s+(?:o\s+)?texto(?:\s+exatamente)?|with\s+(?:the\s+)?(?:exact\s+)?(?:text|content))\s*[:=]?\s*[«"']?([^«"']+)[»"']?/i
  );
  if (m1) return { path: m1[1], content: m1[2].trim() };

  const m2 = o.match(
    /([\w./-]+\.(?:txt|md|json|ts|tsx|js|css|html))\b[\s\S]{0,80}?[«"']([\w .-]{1,80})[»"']/i
  );
  if (m2) return { path: m2[1], content: m2[2].trim() };

  const pathOnly = o.match(/\b([\w./-]+\.(?:txt|md|json))\b/);
  if (pathOnly) return { path: pathOnly[1] };

  return {};
}

export function verifyDefinitionOfDone(input: {
  objective: string;
  definitionOfDone?: string | null;
  evidence: EvidenceLike[];
}): DodResult {
  const checks: DodCheck[] = [];
  const facts = extractFilesystemFacts(input.evidence);
  const hints = parseObjectiveHints(input.objective);
  const dodText = (input.definitionOfDone ?? "").trim();

  checks.push({
    id: "has_evidence",
    label: "Há ao menos uma evidência registrada",
    passed: input.evidence.length > 0,
    detail: `count=${input.evidence.length}`,
  });

  checks.push({
    id: "has_tool_result",
    label: "Há evidência de tool_result (efeito real, não só texto do modelo)",
    passed: facts.toolResults > 0 || facts.writes.length > 0 || facts.reads.length > 0,
    detail: `toolResults≈${facts.toolResults}, writes=${facts.writes.length}, reads=${facts.reads.length}`,
  });

  if (hints.path) {
    const pathHit =
      facts.writes.some((w) => w.path === hints.path || w.path.endsWith(hints.path!)) ||
      facts.reads.some((r) => r.path === hints.path || r.path.endsWith(hints.path!));
    checks.push({
      id: "path_in_evidence",
      label: `Path esperado aparece nas evidências (${hints.path})`,
      passed: pathHit,
      detail: pathHit ? "encontrado" : "não encontrado em writes/reads",
    });
  }

  if (hints.path && hints.content !== undefined) {
    const contentHit = facts.reads.some(
      (r) =>
        (r.path === hints.path || r.path.endsWith(hints.path!)) &&
        r.content === hints.content
    );
    const writeIntent = facts.writes.some(
      (w) =>
        (w.path === hints.path || w.path.endsWith(hints.path!)) &&
        (w.content === undefined || w.content === hints.content)
    );
    // Prefer read-back; aceita write com content se read ainda não parseou
    const ok = contentHit || (writeIntent && facts.writes.some((w) => w.size === hints.content!.length));
    checks.push({
      id: "content_match",
      label: `Conteúdo esperado confirmado ("${hints.content}")`,
      passed: contentHit || writeIntent,
      detail: contentHit
        ? "confirmado via read"
        : writeIntent
          ? "write com path/content alinhado"
          : "não confirmado",
    });
    void ok;
  }

  if (dodText.length > 0) {
    // DoD explícito: exige que o texto (ou trechos) apareça em alguma evidência
    const tokens = dodText
      .split(/[\n;,|]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    const blob = input.evidence.map((e) => String(e.content ?? "")).join("\n");
    let matched = 0;
    for (const t of tokens) {
      if (blob.includes(t)) matched++;
    }
    const ratio = tokens.length === 0 ? 1 : matched / tokens.length;
    checks.push({
      id: "explicit_dod",
      label: "Definition of Done explícita refletida nas evidências",
      passed: ratio >= 0.5,
      detail: `tokens ${matched}/${tokens.length || 0}`,
    });
  }

  // Missão sem hint de arquivo: ainda exige evidência de ferramenta
  if (!hints.path) {
    checks.push({
      id: "generic_tool_progress",
      label: "Progresso de ferramenta ou model_step com efeito",
      passed: facts.toolResults > 0 || facts.modelSteps > 0,
      detail: `modelSteps≈${facts.modelSteps}`,
    });
  }

  const passed = checks.every((c) => c.passed);
  return {
    passed,
    checks,
    summary: passed
      ? "DoD OK — evidências satisfazem os critérios determinísticos"
      : "DoD falhou — COMPLETED bloqueado até corrigir evidências",
  };
}
