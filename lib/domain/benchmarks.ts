/**
 * Reference bands for the Financeiro's indicators: the trade's média and top
 * (or teto/meta), each with its source and safra. Pure data plus the two
 * readings the band needs.
 */

/** Production system: picks the meta/teto of the bands that depend on it. */
export type FarmSystem = "cria" | "ciclo_completo" | "recria_engorda";

export const FARM_SYSTEM_LABEL: Record<FarmSystem, string> = {
  cria: "cria",
  ciclo_completo: "ciclo completo",
  recria_engorda: "recria e engorda",
};

/** A band from `min` to `max` with the média and the top marked on it. */
export interface Benchmark {
  min: number;
  max: number;
  mean: number;
  meanLabel?: string;
  top: number | null;
  topLabel?: string;
  better: "low" | "high";
  source: string;
}

export type BenchmarkKey =
  | "costPerArroba"
  | "arrobasPerHa"
  | "gmd"
  | "offtake"
  | "stocking"
  | "costToRevenue"
  | "outlay";

/** Desfrute meta, % a year (Scot/Inttegra). */
const OFFTAKE_META: Record<FarmSystem, number> = { cria: 35, ciclo_completo: 45, recria_engorda: 55 };
/** Custo ÷ receita teto, % (Inttegra). */
const COST_TO_REVENUE_TETO: Record<FarmSystem, number> = { cria: 65, ciclo_completo: 70, recria_engorda: 60 };
/** Desembolso por cabeça teto, R$/cab/mês (Inttegra 2018/19). */
const OUTLAY_TETO: Record<FarmSystem, number> = { cria: 34.7, ciclo_completo: 52.4, recria_engorda: 57.83 };

/** The band of an indicator for the farm's production system. GMD in kg/day. */
export function benchmark(key: BenchmarkKey, system: FarmSystem): Benchmark {
  switch (key) {
    case "costPerArroba":
      return { min: 100, max: 300, mean: 208, top: 165, better: "low", source: "Inttegra, safra 24/25" };
    case "arrobasPerHa":
      return { min: 0, max: 16, mean: 4.8, top: 12.9, better: "high", source: "Athenagro/Rally 2025" };
    case "gmd":
      return { min: 0.2, max: 0.9, mean: 0.429, top: 0.654, better: "high", source: "Inttegra, safra 24/25" };
    case "offtake":
      return {
        min: 0,
        max: 70,
        mean: 18.9,
        meanLabel: "Brasil",
        top: OFFTAKE_META[system],
        topLabel: "meta",
        better: "high",
        source: "IBGE 2019 · Scot/Inttegra",
      };
    case "stocking":
      return {
        min: 0,
        max: 2.4,
        mean: 0.93,
        meanLabel: "Brasil",
        top: 1.6,
        topLabel: "teto",
        better: "high",
        source: "ABIEC Beef Report 2024",
      };
    case "costToRevenue":
      return {
        min: 30,
        max: 100,
        mean: COST_TO_REVENUE_TETO[system],
        meanLabel: "teto",
        top: null,
        better: "low",
        source: "Inttegra",
      };
    case "outlay":
      return {
        min: 20,
        max: 120,
        mean: OUTLAY_TETO[system],
        meanLabel: "teto 2018/19",
        top: null,
        better: "low",
        source: "Inttegra 2018/19",
      };
  }
}

export type BandTone = "healthy" | "attention" | "overdue";

/**
 * Healthy at or past the top (the mean when there is no top), overdue on the
 * wrong side of the mean, attention in between.
 */
export function bandTone(value: number, b: Benchmark): BandTone {
  // Flip lower-is-better bands so "higher is better" holds for the comparisons.
  const sign = b.better === "high" ? 1 : -1;
  const v = value * sign;
  if (v >= (b.top ?? b.mean) * sign) return "healthy";
  if (v < b.mean * sign) return "overdue";
  return "attention";
}

/** Where the value sits on the band, 0 at `min` and 100 at `max`, clamped. */
export function bandPosition(value: number, b: Benchmark): number {
  return Math.min(100, Math.max(0, ((value - b.min) / (b.max - b.min)) * 100));
}
