/**
 * Agrupamento de tool calls por provedor em blocos CONSECUTIVOS,
 * respeitando a ordem cronologica real dos eventos.
 *
 * Regra: apenas chamadas consecutivas do MESMO provedor formam um bloco.
 * Uma chamada de outro provedor entre duas do mesmo provedor quebra o
 * agrupamento e cria um novo bloco (nao reabre o anterior).
 */
export type GroupableToolCall = {
  id: string;
  provider: string;
};

export type ProviderToolGroup<T extends GroupableToolCall> = {
  provider: string;
  calls: T[];
};

export function groupConsecutiveByProvider<T extends GroupableToolCall>(
  toolCalls: T[] | undefined | null,
): Array<ProviderToolGroup<T>> {
  const groups: Array<ProviderToolGroup<T>> = [];
  for (const tc of toolCalls ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.provider === tc.provider) {
      last.calls.push(tc);
    } else {
      groups.push({ provider: tc.provider, calls: [tc] });
    }
  }
  return groups;
}
