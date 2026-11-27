/**
 * DownloadCoordinator — serialização e invalidação de downloads por modelo.
 *
 * Resolve a corrida clássica: cancelamento remove a marca de cancelamento e a
 * operação antiga (Transformers.js não oferece AbortSignal) volta a atualizar
 * o estado da operação nova. Aqui:
 *  - cada operação recebe um número de geração;
 *  - cancelar/excluir incrementa a geração, invalidando a operação em curso;
 *  - o LOCK do modelo só é liberado quando a promise antiga finaliza (finish);
 *  - operação antiga (stale) não pode atualizar progresso, cache nem estado
 *    da operação nova;
 *  - nunca há duas operações simultâneas para o mesmo modelo.
 *
 * Limitação real do Transformers.js (documentada, não escondida): o cancelamento
 * NÃO interrompe o arquivo em curso; ele deixa de contabilizar/ser aplicado e os
 * bytes parciais são removidos do Cache API em seguida.
 */
export class DownloadCoordinator {
  private generation = new Map<string, number>();
  private running = new Map<string, number>();
  private cancelled = new Set<string>();

  /** Inicia uma operação; retorna null se já houver operação ativa p/ o modelo. */
  begin(modelId: string): number | null {
    if (this.running.has(modelId)) return null;
    const gen = (this.generation.get(modelId) ?? 0) + 1;
    this.generation.set(modelId, gen);
    this.running.set(modelId, gen);
    this.cancelled.delete(modelId);
    return gen;
  }

  /** Cancelamento/exclusão: invalida a geração atual. O lock permanece até finish. */
  cancel(modelId: string): void {
    this.cancelled.add(modelId);
    this.generation.set(modelId, (this.generation.get(modelId) ?? 0) + 1);
  }

  /** Chamado SEMPRE (sucesso, erro ou cancelamento) quando a promise antiga termina. */
  finish(modelId: string, gen: number): void {
    if (this.running.get(modelId) === gen) this.running.delete(modelId);
  }

  /** Operação antiga não pode mais alterar estado (nova geração assumiu). */
  isStale(modelId: string, gen: number): boolean {
    return this.generation.get(modelId) !== gen;
  }

  /** Operação foi cancelada explicitamente (sem novo download iniciado). */
  isCancelled(modelId: string, gen: number): boolean {
    return this.cancelled.has(modelId) || this.isStale(modelId, gen);
  }

  /** Há operação ativa para o modelo? */
  isActive(modelId: string): boolean {
    return this.running.has(modelId);
  }
}
