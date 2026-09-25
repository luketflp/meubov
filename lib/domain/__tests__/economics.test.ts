import { describe, expect, it } from "vitest";
import {
  arrobasBought,
  arrobasProduced,
  arrobasSold,
  averageCalfPrice,
  coe,
  costBreakdown,
  costPerArroba,
  exchangeRatio,
  farmSystem,
  herdArrobasAt,
  indicatorDeltas,
  indicators,
  monthlyRevenueCost,
  offtakeRate,
  outlayPerHeadMonth,
  periodRevenue,
  type EconomicsInputs,
} from "@/lib/domain/economics";
import { herdStockingRateAuPerHa } from "@/lib/store/selectors";
import type {
  Animal,
  Expense,
  ManejoSession,
  ManejoSessionAnimal,
  Movement,
  Treatment,
} from "@/lib/types";
import { makeAnimal, makeManejoSession } from "./fixtures";

/** Fixed reference date for deterministic assertions. */
const REF = "2026-07-24";
const TODAY = REF;
/** January to June 2026: 181 days. */
const P = { start: "2026-01-01", end: "2026-06-30" };
const DAYS = 181;

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
  kind: "expense",
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

const animal = (earTag: string, partial: Partial<Animal> = {}): Animal =>
  makeAnimal({ id: `animal-${earTag}`, earTag, birthDate: "2024-01-10", ...partial });

const pass = (
  earTag: string,
  weightKg?: number,
  partial: Partial<ManejoSessionAnimal> = {}
): ManejoSessionAnimal => ({ earTag, outcome: "done", weightKg, ...partial });

const saleSession = (
  date: string,
  animals: ManejoSessionAnimal[],
  partial: Partial<ManejoSession> = {}
): ManejoSession =>
  makeManejoSession({
    id: `sale-${date}`,
    name: "Venda",
    date,
    status: "closed",
    kind: "sale",
    weighing: true,
    pricePerArroba: 300,
    carcassYieldPct: 50,
    animals,
    ...partial,
  });

const entrySession = (
  date: string,
  animals: ManejoSessionAnimal[],
  partial: Partial<ManejoSession> = {}
): ManejoSession =>
  makeManejoSession({
    id: `entry-${date}`,
    name: "Compra",
    date,
    status: "closed",
    kind: "entry",
    weighing: true,
    destinationLotId: "lot-1",
    animals,
    ...partial,
  });

const soldOnMay10 = { active: false, inactiveReason: "sale" as const, inactiveDate: "2026-05-10" };

/** Each animal's arrobas at 2025-12-31 → 2026-06-30 in the comment. */
const herd: Animal[] = [
  // A: weighed before and inside the window, 300 → 450 kg (10 @ → 15 @).
  animal("A", {
    weighings: [
      { date: "2025-12-01", weightKg: 300 },
      { date: "2026-06-01", weightKg: 450 },
    ],
  }),
  // B: first weighed inside the window, the start takes that weighing (8 @ → 10 @).
  animal("B", {
    birthDate: "2025-06-01",
    weighings: [
      { date: "2026-03-01", weightKg: 240 },
      { date: "2026-06-15", weightKg: 300 },
    ],
  }),
  // C: bought on 2026-02-10, out of the start, in the end (— → 9 @).
  animal("C", {
    weighings: [
      { date: "2026-02-10", weightKg: 210 },
      { date: "2026-06-20", weightKg: 270 },
    ],
  }),
  // D: died on 2026-04-01 (6 @ → —).
  animal("D", {
    active: false,
    inactiveReason: "death",
    inactiveDate: "2026-04-01",
    weighings: [{ date: "2025-11-01", weightKg: 180 }],
  }),
  // E: sold with a chute weight of 480 kg (15 @ → —).
  animal("E", {
    ...soldOnMay10,
    weighings: [
      { date: "2025-12-20", weightKg: 450 },
      { date: "2026-05-10", weightKg: 480 },
    ],
  }),
  // F: sold without a chute weight, last weighed at 420 kg (13 @ → —).
  animal("F", {
    ...soldOnMay10,
    weighings: [
      { date: "2025-10-01", weightKg: 390 },
      { date: "2026-04-01", weightKg: 420 },
    ],
  }),
  // G: sold, never weighed: a head without arrobas.
  animal("G", { ...soldOnMay10 }),
  // H: never weighed, still here (refugo at the venda).
  animal("H"),
];

const sessions: ManejoSession[] = [
  entrySession("2026-02-10", [pass("C", 210, { createdAnimal: true })]),
  saleSession("2026-05-10", [
    pass("E", 480),
    pass("F"),
    pass("G"),
    pass("H", 400, { outcome: "rejected" }),
  ]),
];

const expenses: Expense[] = [
  expense({ id: "e-1", date: "2026-02-05", amountBrl: 3000, paidAt: "2026-02-05" }),
  // Pending despesa inside the window: COE counts it by competência.
  expense({ id: "e-2", date: "2026-03-10", category: "labor", amountBrl: 1000 }),
  expense({ id: "e-3", kind: "revenue", date: "2026-04-01", category: "other", amountBrl: 500 }),
  expense({ id: "e-4", date: "2025-12-15", amountBrl: 800 }),
];

const treatments: Treatment[] = [
  treatment({ animalEarTag: "A", date: "2026-03-01", costBrl: 50 }),
  treatment({ id: "t-2", status: "scheduled", date: "2026-03-01", costBrl: 30 }),
];

const movements: Movement[] = [
  movement({ id: "sale-2026-05-10", date: "2026-05-10", quantity: 3, amountBrl: 9000 }),
  movement({
    id: "entry-2026-02-10",
    type: "purchase",
    category: "calf",
    date: "2026-02-10",
    quantity: 1,
    amountBrl: 2100,
    origin: "Externo",
    destination: "Lote 1",
  }),
];

const input: EconomicsInputs = {
  animals: herd,
  manejoSessions: sessions,
  movements,
  treatments,
  expenses,
  invernadas: [{ id: "inv-1", code: "01", grass: "Braquiária", hectares: 50 }],
  lots: [],
};

const empty: EconomicsInputs = {
  animals: [],
  manejoSessions: [],
  movements: [],
  treatments: [],
  expenses: [],
  invernadas: [],
  lots: [],
};

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
    const series = monthlyRevenueCost([movement({ amountBrl: undefined })], [], [], 3, REF);
    expect(series.every((m) => m.revenue === 0)).toBe(true);
  });

  it("adds receitas to revenue and keeps them out of cost", () => {
    const series = monthlyRevenueCost(
      [],
      [],
      [
        expense({ id: "e-1", kind: "revenue", category: "other", date: "2026-06-20", amountBrl: 700 }),
        expense({ id: "e-2", date: "2026-06-05", amountBrl: 500 }),
      ],
      3,
      REF
    );
    expect(series[1]).toMatchObject({ date: "2026-06-01", revenue: 700, cost: 500 });
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

  it("skips receitas", () => {
    expect(
      costBreakdown(
        [
          expense({ kind: "revenue", category: "other", amountBrl: 900 }),
          expense({ id: "e-2", amountBrl: 100 }),
        ],
        [],
        12,
        REF
      )
    ).toEqual([{ category: "nutrition", amountBrl: 100, pct: 100 }]);
  });
});

describe("coe and periodRevenue", () => {
  it("sums despesas by date (paid or not) and done treatment costs, never receitas", () => {
    expect(coe(expenses, treatments, P)).toBe(4050);
    expect(coe([], [], P)).toBe(0);
  });

  it("splits revenue into priced sales and receitas", () => {
    expect(periodRevenue(expenses, movements, P)).toEqual({ total: 9500, sales: 9000, other: 500 });
    expect(periodRevenue(expenses, movements, { start: "2026-07-01", end: "2026-07-31" })).toEqual({
      total: 0,
      sales: 0,
      other: 0,
    });
  });
});

describe("arrobasSold", () => {
  it("uses the chute weight, falls back to the last weighing and counts the unweighed", () => {
    // E: 480 kg × 50% ÷ 15 = 16 @; F: 420 kg × 50% ÷ 15 = 14 @; G: none; H was refugo.
    expect(arrobasSold(sessions, herd, P)).toEqual({ arrobas: 30, heads: 3, unweighed: 1 });
  });

  it("applies the pass's own rendimento", () => {
    const session = saleSession("2026-05-10", [pass("E", 480, { carcassYieldPct: 55 })]);
    expect(arrobasSold([session], herd, P).arrobas).toBeCloseTo((480 * 0.55) / 15, 6);
  });

  it("ignores sales outside the window", () => {
    expect(arrobasSold(sessions, herd, { start: "2026-06-01", end: "2026-06-30" })).toEqual({
      arrobas: 0,
      heads: 0,
      unweighed: 0,
    });
  });
});

describe("arrobasBought", () => {
  it("sums entry weights ÷ 30; an entry without weight counts the head only", () => {
    expect(arrobasBought(sessions, herd, P)).toEqual({ arrobas: 7, heads: 1 });
    expect(arrobasBought([...sessions, entrySession("2026-03-01", [pass("X")])], herd, P)).toEqual({
      arrobas: 7,
      heads: 2,
    });
  });

  it("takes the animal's weight on the entry date when the entrada has none", () => {
    const unweighed = [entrySession("2026-02-10", [pass("C", undefined, { createdAnimal: true })])];
    // C weighed 210 kg on the entry date (7 @), as herdArrobasAt counts it at the close.
    expect(arrobasBought(unweighed, herd, P)).toEqual({ arrobas: 7, heads: 1 });
  });
});

describe("herdArrobasAt", () => {
  it("counts the animals alive on the date at their weight then", () => {
    // A 10 + B 8 (first weighing) + D 6 + E 15 + F 13; G and H are heads without weight; C not yet bought.
    const start = herdArrobasAt(herd, sessions, "2025-12-31");
    expect(start.arrobas).toBeCloseTo(52, 6);
    expect(start.heads).toBe(7);
    // A 15 + B 10 + C 9; H without weight; D dead, E F G sold.
    const end = herdArrobasAt(herd, sessions, "2026-06-30");
    expect(end.arrobas).toBeCloseTo(34, 6);
    expect(end.heads).toBe(4);
  });

  it("leaves out an animal born after the date", () => {
    expect(herdArrobasAt([animal("Z", { birthDate: "2026-02-01" })], [], "2026-01-31")).toEqual({
      arrobas: 0,
      heads: 0,
    });
  });
});

describe("arrobasProduced", () => {
  it("is sold − bought + the inventory change", () => {
    const produced = arrobasProduced(input, P, TODAY);
    expect(produced).toMatchObject({ sold: 30, bought: 7, unweighed: 1, headsSold: 3 });
    expect(produced.inventoryStart).toBeCloseTo(52, 6);
    expect(produced.inventoryEnd).toBeCloseTo(34, 6);
    expect(produced.delta).toBeCloseTo(-18, 6);
    expect(produced.produced).toBeCloseTo(5, 6);
  });

  it("closes the inventory today when the window ends later", () => {
    const produced = arrobasProduced(input, { start: "2026-07-01", end: "2026-12-31" }, TODAY);
    expect(produced.inventoryEnd).toBeCloseTo(herdArrobasAt(herd, sessions, TODAY).arrobas, 6);
  });
});

describe("unit indicators", () => {
  it("costPerArroba is null without cost or without production", () => {
    expect(costPerArroba(4050, 5)).toBe(810);
    expect(costPerArroba(0, 5)).toBeNull();
    expect(costPerArroba(4050, 0)).toBeNull();
    expect(costPerArroba(4050, -3)).toBeNull();
  });

  it("outlayPerHeadMonth divides by the average heads and the months", () => {
    expect(outlayPerHeadMonth(4050, 5.5, P)).toBeCloseTo(4050 / 5.5 / (DAYS / 30.4375), 6);
    expect(outlayPerHeadMonth(4050, 0, P)).toBeNull();
    expect(outlayPerHeadMonth(0, 5.5, P)).toBeNull();
  });

  it("offtakeRate is annualised", () => {
    expect(offtakeRate(3, 5.5, P)).toBeCloseTo(((3 / 5.5) * 100 * 365) / DAYS, 6);
    expect(offtakeRate(3, 0, P)).toBeNull();
  });

  it("averageCalfPrice uses priced calf purchases in the window", () => {
    expect(averageCalfPrice(movements, P)).toBe(2100);
    expect(averageCalfPrice(movements, { start: "2026-07-01", end: "2026-07-31" })).toBeNull();
    expect(
      averageCalfPrice(
        [
          movement({ type: "purchase", category: "calf", date: "2026-03-01", quantity: 2, amountBrl: 5600 }),
          movement({ id: "m-2", type: "purchase", category: "steer", date: "2026-03-01", amountBrl: 9000 }),
          movement({ id: "m-3", type: "purchase", category: "calf", date: "2026-03-01", amountBrl: undefined }),
        ],
        P
      )
    ).toBe(2800);
  });

  it("exchangeRatio: calves per steer and arrobas per calf", () => {
    const sold = { arrobas: 30, heads: 3, unweighed: 1 };
    const ratio = exchangeRatio(sold, 300, 2100);
    expect(ratio.calvesPerSteer).toBeCloseTo((15 * 300) / 2100, 6);
    expect(ratio.arrobasPerCalf).toBe(7);
    expect(exchangeRatio(sold, null, 2100)).toEqual({ calvesPerSteer: null, arrobasPerCalf: null });
    expect(exchangeRatio(sold, 300, null)).toEqual({ calvesPerSteer: null, arrobasPerCalf: null });
    expect(exchangeRatio({ arrobas: 0, heads: 0, unweighed: 0 }, 300, 2100)).toEqual({
      calvesPerSteer: null,
      arrobasPerCalf: 7,
    });
  });
});

describe("farmSystem", () => {
  const cow = animal("V", {
    category: "cow",
    sex: "female",
    reproduction: {
      breedings: [],
      diagnoses: [],
      calvings: [{ date: "2026-03-01", calfEarTag: "K3" }],
    },
  });
  const calf = (earTag: string) => animal(earTag, { category: "calf", ...soldOnMay10 });
  const steer = animal("S1", { ...soldOnMay10 });

  it("is cria with calvings and mostly calves sold", () => {
    const system = farmSystem(
      {
        ...empty,
        animals: [cow, calf("K1"), calf("K2"), steer],
        manejoSessions: [saleSession("2026-05-10", [pass("K1"), pass("K2"), pass("S1")])],
      },
      P
    );
    expect(system).toBe("cria");
  });

  it("is recria_engorda without calvings and with compras", () => {
    expect(farmSystem(input, P)).toBe("recria_engorda");
  });

  it("is ciclo_completo otherwise", () => {
    expect(
      farmSystem(
        {
          ...empty,
          animals: [cow, steer],
          manejoSessions: [saleSession("2026-05-10", [pass("S1")])],
        },
        P
      )
    ).toBe("ciclo_completo");
    expect(farmSystem(empty, P)).toBe("ciclo_completo");
  });
});

describe("indicators", () => {
  it("assembles the placar", () => {
    const ind = indicators(input, P, 300, TODAY);
    expect(ind.period).toEqual(P);
    expect(ind.system).toBe("recria_engorda");
    expect(ind.heads).toEqual({ start: 7, end: 4, avg: 5.5 });
    expect(ind.hectares).toBe(50);
    expect(ind).toMatchObject({
      revenue: 9500,
      salesRevenue: 9000,
      otherRevenue: 500,
      coe: 4050,
      result: 5450,
      resultPerHa: 109,
      calfPrice: 2100,
    });
    expect(ind.marginPct).toBeCloseTo((5450 / 9500) * 100, 6);
    expect(ind.costToRevenuePct).toBeCloseTo((4050 / 9500) * 100, 6);
    expect(ind.produced.produced).toBeCloseTo(5, 6);
    expect(ind.arrobasPerHa).toBeCloseTo((5 * 365) / DAYS / 50, 6);
    expect(ind.costPerArroba).toBeCloseTo(810, 6);
    // G was sold without any weight: its revenue has no arrobas to divide.
    expect(ind.realizedPerArroba).toBeNull();
    expect(ind.marginPerArroba).toBeCloseTo(-510, 6);
    expect(ind.outlayPerHeadMonth).toBeCloseTo(4050 / 5.5 / (DAYS / 30.4375), 6);
    // B: 240 → 300 kg in 106 days; C: 210 → 270 kg in 130 days; the others have one weighing inside.
    expect(ind.adg.animals).toBe(2);
    expect(ind.adg.kgPerDay).toBeCloseTo((60 / 106 + 60 / 130) / 2, 6);
    expect(ind.offtakePct).toBeCloseTo(((3 / 5.5) * 100 * 365) / DAYS, 6);
    expect(ind.stocking).not.toBeNull();
    expect(ind.stocking).toBeCloseTo(herdStockingRateAuPerHa(herd, input.invernadas), 6);
    expect(ind.exchange.calvesPerSteer).toBeCloseTo((15 * 300) / 2100, 6);
    expect(ind.exchange.arrobasPerCalf).toBe(7);
    // Active: A 450 + B 300 + C 270 kg = 34 @.
    expect(ind.herdArrobas).toBeCloseTo(34, 6);
    expect(ind.herdValue).toBeCloseTo(10200, 6);
    expect(ind.inventoryDeltaBrl).toBeCloseTo(-5400, 6);
    expect(ind.capitalTurnover).toBeCloseTo((9500 * 365) / DAYS / 10200, 6);
  });

  it("realizes R$/@ only when every sold head was weighed and every priced sale has its manejo", () => {
    // Without G: 9000 ÷ (16 + 14) @.
    const weighedSale = saleSession("2026-05-10", [pass("E", 480), pass("F")]);
    const allWeighed = { ...input, manejoSessions: [sessions[0], weighedSale] };
    expect(indicators(allWeighed, P, 300, TODAY).realizedPerArroba).toBeCloseTo(300, 6);
    // A priced legacy sale (no manejo with its id) in the window.
    const legacy = movement({ id: "legacy-1", date: "2026-03-15", amountBrl: 4000 });
    expect(
      indicators({ ...allWeighed, movements: [...movements, legacy] }, P, 300, TODAY)
        .realizedPerArroba
    ).toBeNull();
  });

  it("returns null for the per-hectare figures without hectares and the priced ones without quote", () => {
    const ind = indicators({ ...input, invernadas: [] }, P, null, TODAY);
    expect(ind.hectares).toBe(0);
    expect(ind.resultPerHa).toBeNull();
    expect(ind.arrobasPerHa).toBeNull();
    expect(ind.stocking).toBeNull();
    expect(ind.herdValue).toBeNull();
    expect(ind.capitalTurnover).toBeNull();
    expect(ind.marginPerArroba).toBeNull();
    expect(ind.inventoryDeltaBrl).toBeNull();
    expect(ind.exchange).toEqual({ calvesPerSteer: null, arrobasPerCalf: null });
  });

  it("returns null everywhere a denominator is missing", () => {
    const ind = indicators(empty, P, 300, TODAY);
    expect(ind.heads).toEqual({ start: 0, end: 0, avg: 0 });
    expect(ind.result).toBe(0);
    expect(ind.marginPct).toBeNull();
    expect(ind.costToRevenuePct).toBeNull();
    expect(ind.costPerArroba).toBeNull();
    expect(ind.realizedPerArroba).toBeNull();
    expect(ind.outlayPerHeadMonth).toBeNull();
    expect(ind.offtakePct).toBeNull();
    expect(ind.adg).toEqual({ kgPerDay: null, animals: 0 });
    expect(ind.calfPrice).toBeNull();
  });
});

describe("indicatorDeltas", () => {
  const current = indicators(input, P, 300, TODAY);

  it("compares with the prior window and nulls a side without data", () => {
    const prior = {
      ...current,
      result: 2725,
      costPerArroba: null,
      adg: { kgPerDay: null, animals: 0 },
      offtakePct: 0,
    };
    const deltas = indicatorDeltas(current, prior);
    expect(deltas.result).toEqual({ pct: 100, pts: 2725 });
    expect(deltas.costPerArroba).toEqual({ pct: null, pts: null });
    expect(deltas.adg).toEqual({ pct: null, pts: null });
    // A prior of 0 has no relative change, only the plain difference.
    expect(deltas.offtakePct.pct).toBeNull();
    expect(deltas.offtakePct.pts).toBeCloseTo(current.offtakePct!, 6);
    // Lotação is today's herd in both windows, so it has no delta.
    expect(deltas).not.toHaveProperty("stocking");
  });

  it("measures the change against the prior's magnitude", () => {
    const deltas = indicatorDeltas(current, { ...current, result: -1000 });
    expect(deltas.result.pct).toBeCloseTo(645, 6);
    expect(deltas.result.pts).toBe(6450);
  });
});
