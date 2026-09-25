import { describe, expect, it } from "vitest";
import { lotEconomics } from "@/lib/domain/lotEconomics";
import { coe, type EconomicsInputs } from "@/lib/domain/economics";
import type { Animal, Expense, ManejoSession, ManejoSessionAnimal, Treatment } from "@/lib/types";
import { makeAnimal, makeManejoSession, makeTreatment } from "./fixtures";

const TODAY = "2026-07-24";
/** January to June 2026: 181 days. */
const P = { start: "2026-01-01", end: "2026-06-30" };
const DAYS = 181;
const QUOTE = 300;

const animal = (earTag: string, lotId: string, partial: Partial<Animal> = {}): Animal =>
  makeAnimal({ id: `animal-${earTag}`, earTag, lotId, birthDate: "2024-01-10", ...partial });

const pass = (
  earTag: string,
  weightKg?: number,
  partial: Partial<ManejoSessionAnimal> = {}
): ManejoSessionAnimal => ({ earTag, outcome: "done", weightKg, ...partial });

const expense = (partial: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-02-01",
  category: "nutrition",
  amountBrl: 0,
  ...partial,
});

const cost = (earTag: string, costBrl: number, partial: Partial<Treatment> = {}): Treatment =>
  makeTreatment({
    id: `t-${earTag}`,
    animalEarTag: earTag,
    date: "2026-03-01",
    status: "done",
    costBrl,
    ...partial,
  });

/** Each animal's live arrobas at 2025-12-31 → 2026-06-30 in the comment. */
const animals: Animal[] = [
  // Lote A: three here today and one sold from it.
  animal("A1", "lot-a", {
    weighings: [
      { date: "2025-12-01", weightKg: 300 }, // 10 @
      { date: "2026-01-15", weightKg: 315 },
      { date: "2026-05-01", weightKg: 360 }, // 12 @
    ],
  }),
  animal("A2", "lot-a", {
    weighings: [
      { date: "2025-12-01", weightKg: 330 }, // 11 @
      { date: "2026-05-01", weightKg: 390 }, // 13 @
    ],
  }),
  animal("A3", "lot-a"),
  animal("AS", "lot-a", {
    active: false,
    inactiveReason: "sale",
    inactiveDate: "2026-04-10",
    weighings: [{ date: "2025-12-01", weightKg: 450 }], // 15 @ → sold at 480 kg: 16 @ carcass
  }),
  // Lote B: one of its own and one bought into it.
  animal("B1", "lot-b", {
    weighings: [
      { date: "2025-12-01", weightKg: 240 }, // 8 @
      { date: "2026-06-01", weightKg: 300 }, // 10 @
    ],
  }),
  animal("B2", "lot-b", {
    weighings: [
      { date: "2026-03-01", weightKg: 210 }, // bought: 7 @
      { date: "2026-06-01", weightKg: 270 }, // 9 @
    ],
  }),
];

const sessions: ManejoSession[] = [
  makeManejoSession({
    id: "sale-1",
    name: "Venda",
    date: "2026-04-10",
    status: "closed",
    kind: "sale",
    weighing: true,
    pricePerArroba: QUOTE,
    carcassYieldPct: 50,
    animals: [pass("AS", 480)],
  }),
  makeManejoSession({
    id: "entry-1",
    name: "Compra",
    date: "2026-03-01",
    status: "closed",
    kind: "entry",
    weighing: true,
    destinationLotId: "lot-b",
    animals: [pass("B2", 210, { createdAnimal: true })],
  }),
];

const expenses: Expense[] = [
  expense({ id: "e-a", lotId: "lot-a", amountBrl: 1000 }),
  // Without a lote: shared 60/40 by the heads of A (3) and B (2).
  expense({ id: "e-farm", category: "labor", amountBrl: 2000 }),
  // Lote C has no animals but a direct cost: still listed.
  expense({ id: "e-c", lotId: "lot-c", category: "pasture", amountBrl: 300 }),
  // A receita with a lote is not a cost.
  expense({ id: "e-rev", kind: "revenue", category: "other", lotId: "lot-a", amountBrl: 5000 }),
  // Outside the window.
  expense({ id: "e-old", lotId: "lot-a", date: "2025-12-20", amountBrl: 700 }),
];

const treatments: Treatment[] = [
  cost("A1", 40),
  cost("B1", 60),
  cost("B2", 99, { id: "t-B2-scheduled", status: "scheduled" }),
];

const input: EconomicsInputs = {
  animals,
  manejoSessions: sessions,
  movements: [],
  treatments,
  expenses,
  invernadas: [],
  lots: [
    { id: "lot-b", name: "Lote B" },
    { id: "lot-a", name: "Lote A" },
    { id: "lot-c", name: "Lote C" },
    { id: "lot-d", name: "Lote D", deletedAt: "2026-02-01T10:00:00.000Z" },
    { id: "lot-e", name: "Lote E" },
  ],
};

describe("lotEconomics", () => {
  const { lots, farm } = lotEconomics(input, P, QUOTE, TODAY);
  const byName = (name: string) => lots.find((l) => l.name === name)!;

  it("lists the live lotes with heads or direct cost, by name", () => {
    expect(lots.map((l) => l.name)).toEqual(["Lote A", "Lote B", "Lote C"]);
  });

  it("splits direct and shared cost", () => {
    // A: 1000 + A1's 40; B: B1's 60; C: 300. Shared pool 2000 → 3/5 and 2/5.
    expect(byName("Lote A")).toMatchObject({ lotId: "lot-a", heads: 3, directBrl: 1040, sharedBrl: 1200, totalBrl: 2240 });
    expect(byName("Lote B")).toMatchObject({ lotId: "lot-b", heads: 2, directBrl: 60, sharedBrl: 800, totalBrl: 860 });
    expect(byName("Lote C")).toMatchObject({ lotId: "lot-c", heads: 0, directBrl: 300, sharedBrl: 0, totalBrl: 300 });
  });

  it("gives R$/cab/dia, ADG, @ produzidas and custo/@ per lote", () => {
    const a = byName("Lote A");
    expect(a.perHeadDay).toBeCloseTo(2240 / 3 / DAYS, 6);
    // A1: 315 → 360 kg in 106 days; A2 has one weighing inside.
    expect(a.adg).toBeCloseTo(45 / 106, 6);
    // sold 16 − bought 0 + (12 + 13) − (10 + 11 + 15) = 5
    expect(a.produced).toBeCloseTo(5, 6);
    expect(a.costPerArroba).toBeCloseTo(448, 6);
    expect(a.marginPerArroba).toBeCloseTo(-148, 6);

    const b = byName("Lote B");
    expect(b.perHeadDay).toBeCloseTo(860 / 2 / DAYS, 6);
    // B2: 210 → 270 kg in 92 days.
    expect(b.adg).toBeCloseTo(60 / 92, 6);
    // sold 0 − bought 7 + (10 + 9) − 8 = 4
    expect(b.produced).toBeCloseTo(4, 6);
    expect(b.costPerArroba).toBeCloseTo(215, 6);
    expect(b.marginPerArroba).toBeCloseTo(85, 6);

    const c = byName("Lote C");
    expect(c.perHeadDay).toBeNull();
    expect(c.adg).toBeNull();
    expect(c.produced).toBe(0);
    expect(c.costPerArroba).toBeNull();
    expect(c.marginPerArroba).toBeNull();
  });

  it("closes on a Fazenda row whose total is the COE", () => {
    const total = coe(expenses, treatments, P);
    expect(total).toBe(3400);
    expect(farm).toMatchObject({
      lotId: null,
      name: "Fazenda",
      heads: 5,
      directBrl: 1400,
      sharedBrl: 2000,
      totalBrl: total,
    });
    expect(lots.reduce((sum, l) => sum + l.totalBrl, 0)).toBeCloseTo(total, 6);
    expect(farm.perHeadDay).toBeCloseTo(3400 / 5 / DAYS, 6);
    expect(farm.adg).toBeCloseTo((45 / 106 + 60 / 92) / 2, 6);
    // 16 sold − 7 bought + (44 − 44) = 9 = A 5 + B 4.
    expect(farm.produced).toBeCloseTo(9, 6);
    expect(farm.costPerArroba).toBeCloseTo(3400 / 9, 6);
    expect(farm.marginPerArroba).toBeCloseTo(QUOTE - 3400 / 9, 6);
  });

  it("leaves margin null without a quote and shares nothing without heads", () => {
    expect(lotEconomics(input, P, null, TODAY).farm.marginPerArroba).toBeNull();
    const noHerd = lotEconomics({ ...input, animals: [], treatments: [] }, P, QUOTE, TODAY);
    expect(noHerd.lots.map((l) => [l.name, l.sharedBrl])).toEqual([
      ["Lote A", 0],
      ["Lote C", 0],
    ]);
    expect(noHerd.farm).toMatchObject({ heads: 0, totalBrl: 3300, perHeadDay: null });
  });
});
