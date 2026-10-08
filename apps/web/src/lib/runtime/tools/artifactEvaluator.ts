export type ArtifactEvaluation = {
  ok: boolean;
  score: number;
  checks: Array<{ id: string; passed: boolean; severity: "info" | "warning" | "error"; message: string }>;
};

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/, "Possível segredo de API exposto"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/, "Possível token GitHub exposto"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "Chave privada exposta"],
  [/DATABASE_URL\s*=\s*['\"]?postgres(?:ql)?:\/\/[^\s'\"]+/i, "DATABASE_URL exposta"],
];

export function evaluateArtifact(input: { name: string; type?: string; content: string; size?: number }): ArtifactEvaluation {
  const checks: ArtifactEvaluation["checks"] = [];
  const content = input.content ?? "";
  const name = input.name || "artifact";
  const type = input.type || "text/plain";
  const size = input.size ?? Buffer.byteLength(content, "utf8");
  checks.push({ id: "non_empty", passed: content.length > 0, severity: "error", message: content.length > 0 ? "Conteúdo presente" : "Artefato vazio" });
  checks.push({ id: "size_limit", passed: size <= 20 * 1024 * 1024, severity: "error", message: size <= 20 * 1024 * 1024 ? "Tamanho dentro do limite" : "Artefato excede 20 MB" });
  for (const [pattern, message] of SECRET_PATTERNS) {
    const found = pattern.test(content);
    checks.push({ id: `secret_${checks.length}`, passed: !found, severity: "error", message: found ? message : "Nenhum padrão de secret detectado" });
  }
  if (type.includes("json") || /\.json$/i.test(name)) {
    try {
      JSON.parse(content);
      checks.push({ id: "json_valid", passed: true, severity: "error", message: "JSON válido" });
    } catch {
      checks.push({ id: "json_valid", passed: false, severity: "error", message: "JSON inválido" });
    }
  }
  if (type.includes("html") || /\.html?$/i.test(name)) {
    const dangerous = /<script\b|on(?:error|load|click)\s*=|javascript:/i.test(content);
    checks.push({ id: "html_safe", passed: !dangerous, severity: "error", message: dangerous ? "HTML contém script/event handler perigoso" : "HTML sem padrões perigosos detectados" });
  }
  const hasErrorMarker = /\b(?:TODO\s*:\s*FIXME|throw new Error\(|SyntaxError:|BUILD FAILED)\b/i.test(content);
  checks.push({ id: "error_markers", passed: !hasErrorMarker, severity: "warning", message: hasErrorMarker ? "Há marcadores de erro que exigem revisão" : "Nenhum marcador de erro óbvio" });
  const errors = checks.filter((check) => !check.passed && check.severity === "error").length;
  const warnings = checks.filter((check) => !check.passed && check.severity === "warning").length;
  return { ok: errors === 0, score: Math.max(0, 100 - errors * 25 - warnings * 8), checks };
}
