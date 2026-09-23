import { describe, expect, it } from "vitest";
import { saleRomaneio, saleSessions } from "@/lib/reports/romaneio";
import { makeAnimal, makeManejoSession } from "@/lib/domain/__tests__/fixtures";
import { carcassArrobas } from "@/lib/domain/weights";
import { makeData } from "./data";

describe("saleSessions", () => {
  it("keeps the sales, newest first, open and closed", () => {
    const sessions = [
      makeManejoSession({ id: "s1", kind: "sale", date: "2026-05-01", status: "closed" }),
      makeManejoSession({ id: "w1", kind: "weighing", date: "2026-07-01" }),
      makeManejoSession({ id: "s2", kind: "sale", date: "2026-08-01", status: "open" }),
      makeManejoSession({ id: "s3", kind: "sale", date: "2026-06-01", status: "closed" }),
    ];
    expect(saleSessions(sessions).map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });
});

describe("saleRomaneio", () => {
  const animals = [
    makeAnimal({ id: "a1", earTag: "B-10", category: "steer", breed: "Nelore", birthDate: "2024-03-10", lotId: "lot-1" }),
    makeAnimal({
      id: "a2",
      earTag: "B-11",
      category: "heifer",
      customCategoryId: "cc-1",
      breed: "Angus",
      birthDate: "",
      sex: "female",
      lotId: "lot-1",
    }),
    makeAnimal({ id: "a3", earTag: "B-12", category: "steer", lotId: "lot-1" }),
  ];
  const data = makeData({
    animals,
    lots: [{ id: "lot-1", name: "Engorda" }],
    customCategories: [{ id: "cc-1", name: "Novilha precoce", baseCategory: "heifer" }],
    manejoSessions: [
      makeManejoSession({
        id: "sale-1",
        kind: "sale",
        date: "2026-09-10",
        status: "closed",
        weighing: true,
        counterparty: "  Frigorífico Boi Bom ",
        pricePerArroba: 300,
        carcassYieldPct: 54,
        animals: [
          { earTag: "B-10", outcome: "done", weightKg: 500, amountBrl: 5400, previousLotId: "lot-1" },
          { earTag: "B-12", outcome: "skipped" },
          { earTag: "B-11", outcome: "done", weightKg: 400, amountBrl: 4320, previousLotId: "lot-1" },
        ],
      }),
      makeManejoSession({
        id: "sale-2",
        kind: "sale",
        date: "2026-09-12",
        animals: [{ earTag: "B-12", outcome: "done" }],
        totalAmountBrl: 3000,
      }),
      makeManejoSession({ id: "w-1", kind: "weighing" }),
    ],
  });

  it("returns null for an unknown session or one that is not a sale", () => {
    expect(saleRomaneio(data, "nope")).toBeNull();
    expect(saleRomaneio(data, "w-1")).toBeNull();
  });

  it("lists the done lines with the animal's details", () => {
    const romaneio = saleRomaneio(data, "sale-1");
    expect(romaneio?.rows).toEqual([
      {
        n: 1,
        earTag: "B-10",
        category: "Boi",
        breed: "Nelore",
        ageMonths: 30,
        weightKg: 500,
        arrobas: carcassArrobas(500, 54),
        valueBrl: 5400,
      },
      {
        n: 2,
        earTag: "B-11",
        category: "Novilha precoce",
        breed: "Angus",
        ageMonths: null,
        weightKg: 400,
        arrobas: carcassArrobas(400, 54),
        valueBrl: 4320,
      },
    ]);
  });

  it("totals the sale and names the price, yield, buyer and origin lot", () => {
    const romaneio = saleRomaneio(data, "sale-1");
    expect(romaneio?.session.id).toBe("sale-1");
    expect(romaneio?.totals).toEqual({
      heads: 2,
      weightKg: 900,
      avgKg: 450,
      arrobas: carcassArrobas(900, 54),
      valueBrl: 9720,
    });
    expect(romaneio?.pricePerArroba).toBe(300);
    expect(romaneio?.yieldPct).toBe(54);
    expect(romaneio?.counterparty).toBe("Frigorífico Boi Bom");
    expect(romaneio?.originLot).toBe("Engorda");
  });

  it("reads a sale closed as one lot, with no weights, at the default yield", () => {
    const romaneio = saleRomaneio(data, "sale-2");
    expect(romaneio?.rows).toEqual([
      {
        n: 1,
        earTag: "B-12",
        category: "Boi",
        breed: "Angus",
        ageMonths: 30,
        weightKg: null,
        arrobas: null,
        valueBrl: null,
      },
    ]);
    expect(romaneio?.totals).toEqual({ heads: 1, weightKg: 0, avgKg: null, arrobas: 0, valueBrl: 3000 });
    expect(romaneio?.pricePerArroba).toBeNull();
    expect(romaneio?.yieldPct).toBe(50);
    expect(romaneio?.counterparty).toBeNull();
    // No previousLotId: the lote the animal still names.
    expect(romaneio?.originLot).toBe("Engorda");
  });

  it("gives the carcass arrobas of a weighed lot sale at the default yield", () => {
    const lotSale = makeData({
      animals,
      manejoSessions: [
        makeManejoSession({
          id: "s",
          kind: "sale",
          animals: [{ earTag: "B-10", outcome: "done", weightKg: 450 }],
          totalAmountBrl: 4000,
        }),
      ],
    });
    const romaneio = saleRomaneio(lotSale, "s");
    expect(romaneio?.rows[0].arrobas).toBe(carcassArrobas(450, 50));
    expect(romaneio?.totals.arrobas).toBe(carcassArrobas(450, 50));
    expect(romaneio?.originLot).toBeNull();
  });

  it("prices an apartação at each animal's rendimento and averages it by weight", () => {
    const apartacao = makeData({
      animals,
      manejoSessions: [
        makeManejoSession({
          id: "s",
          kind: "sale",
          weighing: true,
          pricePerArroba: 300,
          carcassYieldPct: 52,
          animals: [
            { earTag: "B-10", outcome: "done", weightKg: 500, carcassYieldPct: 54 },
            { earTag: "B-11", outcome: "done", weightKg: 400 },
            { earTag: "B-12", outcome: "rejected", weightKg: 380 },
          ],
        }),
      ],
    });
    const romaneio = saleRomaneio(apartacao, "s");
    expect(romaneio?.rows.map((row) => row.arrobas)).toEqual([
      carcassArrobas(500, 54),
      carcassArrobas(400, 52),
    ]);
    expect(romaneio?.totals.arrobas).toBeCloseTo(carcassArrobas(500, 54) + carcassArrobas(400, 52));
    expect(romaneio?.yieldPct).toBeCloseTo((500 * 54 + 400 * 52) / 900);
    expect(romaneio?.yieldVaries).toBe(true);
  });

  it("keeps one rendimento when every animal was priced at the padrão", () => {
    expect(saleRomaneio(data, "sale-1")?.yieldVaries).toBe(false);
  });
});
