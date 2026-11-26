/**
 * Pesquisa do histórico de conversas — filtragem pura e testavel.
 * Normaliza acentos/caixa para busca tolerante em pt-BR.
 */
export type SearchableConversation = {
  id: string;
  title: string;
  subtitle?: string;
  projectName?: string | null;
};

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filterHistory<T extends SearchableConversation>(
  history: T[],
  query: string,
): T[] {
  const q = normalizeSearchText(query).trim();
  if (!q) return history;
  const terms = q.split(/\s+/).filter(Boolean);
  return history.filter((item) => {
    const haystack = normalizeSearchText(
      [item.title, item.subtitle, item.projectName].filter(Boolean).join(" "),
    );
    return terms.every((t) => haystack.includes(t));
  });
}
