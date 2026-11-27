import { describe, expect, it } from "vitest";
import { ProgressAggregator, cacheKeyMatchesRepo } from "./downloadManager";

describe("ProgressAggregator", () => {
  it("agrega bytes por arquivo e calcula percentual real", () => {
    const agg = new ProgressAggregator(0);
    const s1 = agg.apply({ status: "progress", file: "a.onnx", loaded: 250, total: 1000 }, 1000);
    expect(s1.loadedBytes).toBe(250);
    expect(s1.totalBytes).toBe(1000);
    expect(s1.progress).toBe(25);
    const s2 = agg.apply({ status: "progress", file: "b.onnx", loaded: 500, total: 1000 }, 2000);
    expect(s2.loadedBytes).toBe(750);
    expect(s2.totalBytes).toBe(2000);
    expect(s2.progress).toBe(38);
  });

  it("atualiza o mesmo arquivo sem duplicar bytes", () => {
    const agg = new ProgressAggregator(0);
    agg.apply({ status: "progress", file: "a.onnx", loaded: 100, total: 400 }, 1000);
    const s = agg.apply({ status: "progress", file: "a.onnx", loaded: 200, total: 400 }, 2000);
    expect(s.loadedBytes).toBe(200);
    expect(s.totalBytes).toBe(400);
    expect(s.progress).toBe(50);
  });

  it("ignora eventos sem total (initiate/done)", () => {
    const agg = new ProgressAggregator(0);
    const s = agg.apply({ status: "initiate", file: "x.json" }, 1000);
    expect(s.progress).toBe(0);
  });

  it("percentual não passa de 100", () => {
    const agg = new ProgressAggregator(0);
    const s = agg.apply({ status: "progress", file: "a.onnx", loaded: 1200, total: 1000 }, 1000);
    expect(s.progress).toBe(100);
  });

  it("velocidade calculada a partir do delta", () => {
    const agg = new ProgressAggregator(0);
    agg.apply({ status: "progress", file: "a", loaded: 0, total: 1000000 }, 0);
    const s = agg.apply({ status: "progress", file: "a", loaded: 1048576, total: 1000000 }, 1000);
    expect(s.speedMBs).toBeGreaterThan(0.9);
  });
});

describe("cacheKeyMatchesRepo", () => {
  it("casa URL do repositório", () => {
    expect(cacheKeyMatchesRepo("https://huggingface.co/Xenova/Qwen2.5-1.5B-Instruct/resolve/main/onnx/model.onnx", "Xenova/Qwen2.5-1.5B-Instruct")).toBe(true);
  });

  it("não casa repositório diferente", () => {
    expect(cacheKeyMatchesRepo("https://huggingface.co/Xenova/Other/resolve/main/onnx/model.onnx", "Xenova/Qwen2.5-1.5B-Instruct")).toBe(false);
  });
});
