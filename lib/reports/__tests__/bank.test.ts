import { describe, expect, it } from "vitest";
import {
  bankFlowSince,
  bankReport,
  lastSalePrice,
  unweighedByCategory,
  type BankParams,
} from "@/lib/reports/bank";
import { herdDeclaration } from "@/lib/reports/declaration";
import { makeAnimal, makeManejoSession } from "@/lib/domain/__tests__/fixtures";
import { carcassArrobas } from "@/lib/domain/weights";
import { makeData } from "./data";

const BASE = "2026-09-22";

describe("lastSalePrice", () => {
  it("is null without a priced sale", () => {
    expect(lastSalePrice([])).toBeNull();
    expect(
      lastSalePrice([
        makeManejoSession({ kind: "sale", totalAmountBrl: 1000, animals: [{ earTag: "A", outcome: "done" }] }),
      ])
    ).toBeNull();
  });

  it("takes the newest sale priced per arroba that sold an animal", () => {
    const sessions = [
      makeManejoSession({
        id: "old",
        kind: "sale",
        date: "2026-03-01",
        pricePerArroba: 280,
        carcassYieldPct: 52,
        animals: [{ earTag: "A", outcome: "done" }],
      }),
      makeManejoSession({
        id: "new",
        kind: "sale",
        date: "2026-06-01",
        pricePerArroba: 310,
        animals: [{ earTag: "B", outcome: "done" }],
      }),
      // Nothing passed yet: not a sale that happened.
      makeManejoSession({
        id: "empty",
        kind: "sale",
        date: "2026-09-01",
        pricePerArroba: 999,
        animals: [{ earTag: "C", outcome: "pending" }],
      }),
    ];
    expect(lastSalePrice(sessions)).toEqual({ date: "2026-06-01", pricePerArroba: 310, yieldPct: 50 });
  });
});

describe("bankFlowSince", () => {
  it("is the first day of the month 11 months before the base date", () => {
    expect(bankFlowSince("2026-09-22")).toBe("2025-10-01");
    expect(bankFlowSince("2026-01-31")).toBe("2025-02-01");
  });
});

describe("bankReport", () => {
  const params: BankParams = {
    baseDate: BASE,
    pricePerArroba: 300,
    yieldPct: 50,
    headPrice: { calf: 1500 },
  };

  const data = makeData({
    lots: [
      { id: "lot-1", name: "Engorda" },
      { id: "lot-2", name: "Cria" },
      { id: "lot-3", name: "Antigo", deletedAt: "2026-01-01T00:00:00Z" },
    ],
    invernadas: [{ id: "inv-1", code: "03", name: "Baixada", grass: "", hectares: 10 }],
    lotPlacements: [{ id: "p1", lotId: "lot-1", invernadaId: "inv-1", startedOn: "2026-01-01" }],
    animals: [
      makeAnimal({
        id: "s1",
        earTag: "S-1",
        category: "steer",
        lotId: "lot-1",
        weighings: [
          { date: "2026-06-01", weightKg: 400 },
          { date: "2026-09-01", weightKg: 490 },
          // After the base date: not read.
          { date: "2026-10-01", weightKg: 520 },
        ],
      }),
      makeAnimal({
        id: "s2",
        earTag: "S-2",
        category: "steer",
        lotId: "lot-1",
        weighings: [{ date: "2026-08-01", weightKg: 410 }],
      }),
      // Unweighed calf, priced per head.
      makeAnimal({ id: "c1", earTag: "C-1", category: "calf", birthDate: "2026-05-01", lotId: "lot-2" }),
      // Unweighed cow, no head price.
      makeAnimal({ id: "v1", earTag: "V-1", category: "cow", sex: "female", lotId: "lot-2" }),
      // Weighed only after the base date: unweighed on it.
      makeAnimal({
        id: "v2",
        earTag: "V-2",
        category: "cow",
        sex: "female",
        lotId: "lot-2",
        weighings: [{ date: "2026-09-30", weightKg: 450 }],
      }),
      // Sold before the base date: not in the herd.
      makeAnimal({
        id: "x",
        earTag: "X",
        category: "steer",
        active: false,
        inactiveReason: "sale",
        inactiveDate: "2026-08-01",
        weighings: [{ date: "2026-07-01", weightKg: 500 }],
      }),
      // In a deleted lot: counted in the inventory, not in the lots.
      makeAnimal({ id: "b1", earTag: "T-1", category: "bull", lotId: "lot-3" }),
    ],
  });

  it("values the herd on the base date by category", () => {
    const report = bankReport(data, params);
    const steerArrobas = carcassArrobas(490, 50) + carcassArrobas(410, 50);
    expect(report.rows).toEqual([
      {
        category: "calf",
        heads: 1,
        weighed: 0,
        avgKg: null,
        arrobas: 0,
        unweighed: 1,
        headPrice: 1500,
        valueBrl: 1500,
      },
      {
        category: "cow",
        heads: 2,
        weighed: 0,
        avgKg: null,
        arrobas: 0,
        unweighed: 2,
        headPrice: null,
        valueBrl: 0,
      },
      {
        category: "steer",
        heads: 2,
        weighed: 2,
        avgKg: 450,
        arrobas: steerArrobas,
        unweighed: 0,
        headPrice: null,
        valueBrl: steerArrobas * 300,
      },
      {
        category: "bull",
        heads: 1,
        weighed: 0,
        avgKg: null,
        arrobas: 0,
        unweighed: 1,
        headPrice: null,
        valueBrl: 0,
      },
    ]);
    expect(report.totals).toEqual({
      heads: 6,
      weighed: 2,
      liveKg: 900,
      arrobas: steerArrobas,
      valueBrl: steerArrobas * 300 + 1500,
    });
  });

  it("uses the yield it is given", () => {
    const report = bankReport(data, { ...params, yieldPct: 54 });
    const steer = report.rows.find((row) => row.category === "steer");
    expect(steer?.arrobas).toBeCloseTo(carcassArrobas(900, 54));
  });

  it("carries the 12-month flow ending at the base date", () => {
    const report = bankReport(data, params);
    const since = bankFlowSince(BASE);
    // The window takes in the first day of its first month.
    expect(report.flow).toEqual(herdDeclaration(data, BASE, "2025-09-30").flow);
    expect(since).toBe("2025-10-01");
    expect(report.flow.sales).toBe(1);
  });

  it("lists the active lots with animals, by heads", () => {
    const report = bankReport(data, params);
    expect(report.lots).toEqual([
      { lotName: "Cria", invernada: null, heads: 3, avgKg: null, adg: null },
      { lotName: "Engorda", invernada: "03 · Baixada", heads: 2, avgKg: 450, adg: 90 / 92 },
    ]);
  });
});

describe("unweighedByCategory", () => {
  it("counts the present animals with no weighing on or before the date", () => {
    const data = makeData({
      animals: [
        makeAnimal({ id: "a", earTag: "A", category: "calf" }),
        makeAnimal({ id: "b", earTag: "B", category: "calf" }),
        makeAnimal({ id: "c", earTag: "C", category: "cow", weighings: [{ date: "2026-10-01", weightKg: 400 }] }),
        makeAnimal({ id: "d", earTag: "D", category: "cow", weighings: [{ date: "2026-01-01", weightKg: 400 }] }),
        makeAnimal({ id: "e", earTag: "E", category: "cow", active: false, inactiveReason: "death", inactiveDate: "2026-01-01" }),
      ],
    });
    expect(unweighedByCategory(data, BASE)).toEqual({ calf: 2, cow: 1 });
  });
});
