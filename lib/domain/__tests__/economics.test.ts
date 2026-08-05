import { describe, expect, it } from "vitest";
import {
  annualRevenue,
  arrobasProducedPerYear,
  averageArrobasPerSteer,
  averageCalfPrice,
  capitalTurnoverRatio,
  costBreakdown,
  dailyCostPerHead,
  headSoldLast12m,
  monthlyRevenueCost,
  offtakeRate,
  productionCostPerArroba,
  steerToCalfExchange,
  totalCostLast12m,
} from "@/lib/domain/economics";
import type { Animal, Expense, Movement, Treatment } from "@/lib/types";

/** Fixed reference date for deterministic assertions. */
const REF = "2026-07-24";

const movement = (partial: Partial<Movement>): Movement => ({
  id: "m-1",
  type: "sale",
  date: "2026-06-10",
  quantity: 1,
  category: "steer",
  origin: "Lote A",
  destination: "Externo",
  amountBrl: 1000,
  ...partial,
});

const expense = (partial: Partial<Expense>): Expense => ({
  id: "e-1",
  date: "2026-06-05",
  category: "nutrition",
  amountBrl: 500,
  ...partial,
});

const treatment = (partial: Partial<Treatment>): Treatment => ({
  id: "t-1",
  animalEarTag: "BR-1",
  type: "vaccine",
  name: "Vacina",
  date: "2026-06-15",
  status: "done",
  withdrawalDays: 0,
  costBrl: 100,
  ...partial,
});

const steer = (earTag: string, weightKg: number | null): Animal => ({
  id: `animal-${earTag}`,
  earTag,
  category: "steer",
  breed: "Nelore",
  sex: "male",
  birthDate: "2024-01-10",
  lotId: "lot-1",
  active: true,
  weighings: weightKg === null ? [] : [{ date: "2026-06-01", weightKg }],
});

describe("monthlyRevenueCost", () => {
  it("buckets priced sales, expenses and done treatment costs by month", () => {
    const series = monthlyRevenueCost(
      [
        movement({ date: "2026-06-10", amountBrl: 8000 }),
        movement({ id: "m-2", type: "purchase", date: "2026-06-12", amountBrl: 5000 }),
        movement({ id: "m-3", type: "transfer", date: "2026-06-13", amountBrl: undefined }),
        movement({ id: "m-4", date: "2026-05-02", amountBrl: 3000 }),
      ],
      [treatment({ date: "2026-06-15", costBrl: 100 })],
      [expense({ date: "2026-06-05", amountBrl: 500 })],
      3,
      REF
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ date: "2026-05-01", revenue: 3000, cost: 0 });
    // Purchases are capital: only the sale counts as June revenue.
    expect(series[1]).toMatchObject({ date: "2026-06-01", revenue: 8000, cost: 600 });
    expect(series[2]).toMatchObject({ date: "2026-07-01", revenue: 0, cost: 0 });
  });

  it("excludes legacy sales without a value", () => {
    const series = monthlyRevenueCost(
      [movement({ amountBrl: undefined })],
      [],
      [],
      3,
      REF
    );
    expect(series.every((m) => m.revenue === 0)).toBe(true);
  });
});

describe("costBreakdown", () => {
  it("splits by category, folding done treatments into health", () => {
    const slices = costBreakdown(
      [
        expense({ category: "nutrition", amountBrl: 600 }),
        expense({ id: "e-2", category: "labor", amountBrl: 300 }),
      ],
      [treatment({ costBrl: 100 })],
      12,
      REF
    );
    expect(slices[0]).toMatchObject({ category: "nutrition", amountBrl: 600, pct: 60 });
    expect(slices[1]).toMatchObject({ category: "labor", amountBrl: 300, pct: 30 });
    expect(slices[2]).toMatchObject({ category: "health", amountBrl: 100, pct: 10 });
  });

  it("returns empty when there is no cost", () => {
    expect(costBreakdown([], [treatment({ status: "scheduled" })], 12, REF)).toEqual([]);
  });
});

describe("rolling-year totals", () => {
  it("ignores records older than 12 months", () => {
    const old = "2025-06-01";
    expect(annualRevenue([movement({ date: old })], REF)).toBe(0);
    expect(totalCostLast12m([expense({ date: old })], [], REF)).toBe(0);
    expect(headSoldLast12m([movement({ date: old })], REF)).toBe(0);
  });

  it("sums recent sales, costs and heads", () => {
    expect(annualRevenue([movement({ amountBrl: 8000 })], REF)).toBe(8000);
    expect(
      totalCostLast12m([expense({ amountBrl: 500 })], [treatment({ costBrl: 100 })], REF)
    ).toBe(600);
    expect(headSoldLast12m([movement({ quantity: 3 })], REF)).toBe(3);
  });
});

describe("indicators", () => {
  it("averageCalfPrice uses priced calf purchases only", () => {
    expect(averageCalfPrice([], REF)).toBeNull();
    expect(
      averageCalfPrice(
        [
          movement({ type: "purchase", category: "calf", quantity: 2, amountBrl: 5600 }),
          movement({ id: "m-2", type: "purchase", category: "steer", amountBrl: 9000 }),
        ],
        REF
      )
    ).toBe(2800);
  });

  it("averageArrobasPerSteer averages weighed active steers, null when none", () => {
    expect(averageArrobasPerSteer([steer("A", null)])).toBeNull();
    const value = averageArrobasPerSteer([steer("A", 450), steer("B", 510)]);
    expect(value).toBeCloseTo((450 / 30 + 510 / 30) / 2, 5);
  });

  it("arrobasProducedPerYear: 0 without sales, null without weighed steers", () => {
    expect(arrobasProducedPerYear([], [steer("A", 450)], REF)).toBe(0);
    expect(arrobasProducedPerYear([movement({})], [steer("A", null)], REF)).toBeNull();
    expect(arrobasProducedPerYear([movement({ quantity: 2 })], [steer("A", 450)], REF)).toBeCloseTo(
      2 * (450 / 30),
      5
    );
  });

  it("returns null on the degenerate denominators", () => {
    expect(dailyCostPerHead(0, 10)).toBeNull();
    expect(dailyCostPerHead(3650, 0)).toBeNull();
    expect(dailyCostPerHead(36500, 10)).toBeCloseTo(10, 5);
    expect(productionCostPerArroba(0, 100)).toBeNull();
    expect(productionCostPerArroba(1000, null)).toBeNull();
    expect(productionCostPerArroba(1000, 0)).toBeNull();
    expect(offtakeRate(5, 0)).toBeNull();
    expect(offtakeRate(5, 50)).toBe(10);
    expect(capitalTurnoverRatio(0, 100000)).toBeNull();
    expect(capitalTurnoverRatio(50000, null)).toBeNull();
    expect(capitalTurnoverRatio(50000, 200000)).toBe(0.25);
    expect(steerToCalfExchange(null, 19, 2800)).toBeNull();
    expect(steerToCalfExchange(300, 19, 2850)).toBeCloseTo((19 * 300) / 2850, 5);
  });
});
