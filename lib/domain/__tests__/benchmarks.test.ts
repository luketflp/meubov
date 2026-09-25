import { describe, expect, it } from "vitest";
import {
  bandPosition,
  bandTone,
  benchmark,
  FARM_SYSTEM_LABEL,
} from "@/lib/domain/benchmarks";

describe("benchmark", () => {
  it("carries the value, the direction and the source", () => {
    expect(benchmark("costPerArroba", "cria")).toEqual({
      min: 100,
      max: 300,
      mean: 208,
      top: 165,
      better: "low",
      source: "Inttegra, safra 24/25",
    });
    expect(benchmark("stocking", "cria")).toEqual({
      min: 0,
      max: 2.4,
      mean: 0.93,
      meanLabel: "Brasil",
      top: 1.6,
      topLabel: "teto",
      better: "high",
      source: "ABIEC Beef Report 2024",
    });
    expect(benchmark("gmd", "cria")).toMatchObject({ mean: 0.429, top: 0.654, better: "high" });
    expect(benchmark("arrobasPerHa", "cria")).toMatchObject({
      mean: 4.8,
      top: 12.9,
      source: "Athenagro/Rally 2025",
    });
  });

  it("uses the production system's meta or teto", () => {
    expect(benchmark("offtake", "cria").top).toBe(35);
    expect(benchmark("offtake", "ciclo_completo").top).toBe(45);
    expect(benchmark("offtake", "recria_engorda").top).toBe(55);
    expect(benchmark("offtake", "cria")).toMatchObject({ mean: 18.9, meanLabel: "Brasil", topLabel: "meta" });

    expect(benchmark("costToRevenue", "cria").mean).toBe(65);
    expect(benchmark("costToRevenue", "ciclo_completo").mean).toBe(70);
    expect(benchmark("costToRevenue", "recria_engorda").mean).toBe(60);
    expect(benchmark("costToRevenue", "cria")).toMatchObject({ top: null, meanLabel: "teto", better: "low" });

    expect(benchmark("outlay", "cria").mean).toBe(34.7);
    expect(benchmark("outlay", "ciclo_completo").mean).toBe(52.4);
    expect(benchmark("outlay", "recria_engorda").mean).toBe(57.83);
    expect(benchmark("outlay", "cria")).toMatchObject({
      top: null,
      meanLabel: "teto 2018/19",
      source: "Inttegra 2018/19",
    });
  });

  it("names the systems", () => {
    expect(FARM_SYSTEM_LABEL).toEqual({
      cria: "cria",
      ciclo_completo: "ciclo completo",
      recria_engorda: "recria e engorda",
    });
  });
});

describe("bandTone", () => {
  it("reads a lower-is-better band", () => {
    const b = benchmark("costPerArroba", "cria");
    expect(bandTone(150, b)).toBe("healthy");
    expect(bandTone(165, b)).toBe("healthy");
    expect(bandTone(190, b)).toBe("attention");
    expect(bandTone(208, b)).toBe("attention");
    expect(bandTone(250, b)).toBe("overdue");
  });

  it("reads a higher-is-better band", () => {
    const b = benchmark("gmd", "cria");
    expect(bandTone(0.7, b)).toBe("healthy");
    expect(bandTone(0.5, b)).toBe("attention");
    expect(bandTone(0.3, b)).toBe("overdue");
  });

  it("uses the mean as the line when there is no top", () => {
    const b = benchmark("costToRevenue", "recria_engorda");
    expect(bandTone(55, b)).toBe("healthy");
    expect(bandTone(60, b)).toBe("healthy");
    expect(bandTone(62, b)).toBe("overdue");
  });

  it("moves with the system's meta", () => {
    expect(bandTone(40, benchmark("offtake", "cria"))).toBe("healthy");
    expect(bandTone(40, benchmark("offtake", "ciclo_completo"))).toBe("attention");
    expect(bandTone(40, benchmark("offtake", "recria_engorda"))).toBe("attention");
    expect(bandTone(15, benchmark("offtake", "cria"))).toBe("overdue");
    expect(bandTone(50, benchmark("outlay", "cria"))).toBe("overdue");
    expect(bandTone(50, benchmark("outlay", "ciclo_completo"))).toBe("healthy");
  });
});

describe("bandPosition", () => {
  it("places the value on the band's scale", () => {
    expect(bandPosition(200, benchmark("costPerArroba", "cria"))).toBe(50);
    expect(bandPosition(0.55, benchmark("gmd", "cria"))).toBeCloseTo(50);
  });

  it("clamps to 0..100", () => {
    expect(bandPosition(50, benchmark("costPerArroba", "cria"))).toBe(0);
    expect(bandPosition(400, benchmark("costPerArroba", "cria"))).toBe(100);
    expect(bandPosition(-5, benchmark("offtake", "cria"))).toBe(0);
  });
});
