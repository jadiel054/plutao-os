import { describe, expect, it } from "vitest";
import { DownloadCoordinator } from "./downloadCoordinator";

describe("DownloadCoordinator — corrida cancelar → reiniciar", () => {
  it("operação antiga não marca a nova como concluída nem altera seu estado", () => {
    const c = new DownloadCoordinator();
    const gen1 = c.begin("m1");
    expect(gen1).not.toBeNull();

    // Cancela: geração 1 fica inválida; lock permanece (promise antiga viva).
    c.cancel("m1");
    expect(c.isCancelled("m1", gen1!)).toBe(true);
    expect(c.isActive("m1")).toBe(true);

    // Novo download NÃO pode começar enquanto a promise antiga não finaliza.
    expect(c.begin("m1")).toBeNull();

    // Promise antiga finaliza: libera o lock.
    c.finish("m1", gen1!);
    expect(c.isActive("m1")).toBe(false);

    // Novo download recebe geração nova.
    const gen2 = c.begin("m1");
    expect(gen2).not.toBeNull();
    expect(gen2).not.toBe(gen1);

    // Operação antiga atrasada termina DEPOIS: stale — não pode marcar done
    // nem atualizar progresso/estado da operação nova.
    expect(c.isStale("m1", gen1!)).toBe(true);
    expect(c.isCancelled("m1", gen1!)).toBe(true);
    c.finish("m1", gen1!);
    // lock da operação NOVA permanece intacto
    expect(c.isActive("m1")).toBe(true);
    expect(c.isStale("m1", gen2!)).toBe(false);
  });

  it("dois begins simultâneos: apenas um ganha", () => {
    const c = new DownloadCoordinator();
    const a = c.begin("m2");
    const b = c.begin("m2");
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("delete (cancel) invalida geração mesmo sem novo download", () => {
    const c = new DownloadCoordinator();
    const gen = c.begin("m3")!;
    c.cancel("m3");
    expect(c.isStale("m3", gen)).toBe(true);
  });
});
