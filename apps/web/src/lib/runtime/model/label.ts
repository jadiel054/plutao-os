/**
 * Label de modelo para UI. Evita prefixo duplicado: quando o model id já
 * contém "/", não concatena o provider por cima nem duplica prefixos.
 */
export function formatModelLabel(
  provider: string | null | undefined,
  model: string | null | undefined
): string {
  if (!model) return provider ?? "";
  if (model.includes("/")) return model;
  return provider ? `${provider}/${model}` : model;
}
