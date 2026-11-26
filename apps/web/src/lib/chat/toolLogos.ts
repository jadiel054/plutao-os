/**
 * Mapeamento puro provedor -> identidade visual da ferramenta.
 * Mantido livre de JSX para facilitar testes unitarios.
 */
export type ToolLogoId = "github" | "vercel" | "neon" | "browser" | "generic";

export function toolLogoFor(provider: string): ToolLogoId {
  const p = (provider || "").toLowerCase();
  if (p.includes("github")) return "github";
  if (p.includes("vercel")) return "vercel";
  if (p.includes("neon")) return "neon";
  if (p.includes("browser") || p.includes("navegador") || p.includes("playwright") || p.includes("web")) return "browser";
  return "generic";
}

export function providerDisplayName(provider: string): string {
  const p = (provider || "").trim();
  if (!p) return "Conector";
  switch (toolLogoFor(p)) {
    case "github": return "GitHub";
    case "vercel": return "Vercel";
    case "neon": return "Neon";
    case "browser": return "Navegador";
    default: return p.charAt(0).toUpperCase() + p.slice(1);
  }
}
