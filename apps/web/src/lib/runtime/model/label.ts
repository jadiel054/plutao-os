/**
 * Label de modelo para UI. Evita prefixo duplicado: quando o model id já
 * contém "/" (ex.: apiModel da Groq "openai/gpt-oss-120b"), não concatena
 * o provider por cima ("openai/openai/gpt-oss-120b").
 */
export function formatModelLabel(
  provider: string | null | undefined,
  model: string | null | undefined
): string {
  if (!model) return provider ?? "";
  if (model.includes("/")) return model;
  return provider ? `${provider}/${model}` : model;
}
