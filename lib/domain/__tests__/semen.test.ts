import { describe, expect, it } from "vitest";
import type { Animal, Breeding, PregnancyDiagnosis, SemenPurchase } from "@/lib/types";
import {
  bullInseminations,
  bullPregnancy,
  bullStock,
  canRemovePurchase,
  dosesUsed,
  eligibleForInsemination,
  inseminationBulls,
  predominantLotId,
  purchaseExpenseNotes,
  sessionDosesByBull,
  sessionSemenCost,
} from "@/lib/domain/semen";
import { makeAnimal, makeManejoSession, makeSemenBull } from "./fixtures";

/** An IATF cobertura; with a bull id it used a dose of that registered bull. */
function breeding(id: string, date: string, semenBullId?: string): Breeding {
  return {
    id,
    date,
    type: "timedAI",
    bullEarTag: semenBullId ?? "T-10",
    ...(semenBullId !== undefined ? { semenBullId } : {}),
  };
}

function cow(
  earTag: string,
  breedings: Breeding[],
  diagnoses: PregnancyDiagnosis[] = [],
  over: Partial<Animal> = {}
): Animal {
  return makeAnimal({
    id: `id-${earTag}`,
    earTag,
    category: "cow",
    sex: "female",
    reproduction: { breedings, diagnoses, calvings: [] },
    ...over,
  });
}

/** `n` cows, each inseminated once with `bullId`. */
function inseminated(bullId: string, n: number): Animal[] {
  return Array.from({ length: n }, (_, i) =>
    cow(`${bullId}-${i}`, [breeding(`${bullId}-b-${i}`, "2026-07-01", bullId)])
  );
}

const purchase = (overrides: Partial<SemenPurchase> = {}): SemenPurchase => ({
  id: "p-1",
  date: "2026-03-01",
  doses: 40,
  totalBrl: 1520,
  ...overrides,
});

describe("dosesUsed", () => {
  it("counts every cobertura of the bull, inactive dams included", () => {
    const animals = [
      cow("B-001", [breeding("b1", "2026-05-01", "bull-1"), breeding("b2", "2026-07-01", "bull-2")]),
      cow("B-002", [breeding("b3", "2026-07-01", "bull-1")], [], { active: false }),
      cow("B-003", [breeding("b4", "2026-07-01")]),
      makeAnimal({ earTag: "BR-100" }),
    ];

    expect(dosesUsed("bull-1", animals)).toBe(2);
    expect(dosesUsed("bull-2", animals)).toBe(1);
    expect(dosesUsed("bull-9", animals)).toBe(0);
  });
});

describe("bullStock", () => {
  it("has no cost and no last purchase before the first purchase", () => {
    expect(bullStock(makeSemenBull(), [])).toEqual({
      bought: 0,
      used: 0,
      left: 0,
      totalBrl: 0,
      avgCostPerDose: null,
      lastPurchase: null,
    });
  });

  it("adds the purchases and takes out the doses used", () => {
    const bull = makeSemenBull({
      purchases: [
        purchase({ id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520 }),
        purchase({ id: "p-2", date: "2026-06-10", doses: 20, totalBrl: 760 }),
      ],
    });

    expect(bullStock(bull, inseminated("bull-1", 3))).toEqual({
      bought: 60,
      used: 3,
      left: 57,
      totalBrl: 2280,
      avgCostPerDose: 38,
      lastPurchase: "2026-06-10",
    });
  });

  it("counts the doses but has no cost when a purchase came without its total", () => {
    const bull = makeSemenBull({
      purchases: [
        purchase({ id: "p-1", doses: 40, totalBrl: 1520 }),
        { id: "p-2", date: "2026-06-10", doses: 20 },
      ],
    });

    expect(bullStock(bull, inseminated("bull-1", 3))).toEqual({
      bought: 60,
      used: 3,
      left: 57,
      totalBrl: null,
      avgCostPerDose: null,
      lastPurchase: "2026-06-10",
    });
  });
});

describe("canRemovePurchase", () => {
  const bull = makeSemenBull({
    purchases: [purchase({ id: "p-1", doses: 40 }), purchase({ id: "p-2", doses: 20 })],
  });

  it("allows it while the other purchases still cover the doses used", () => {
    expect(canRemovePurchase(bull, "p-2", inseminated("bull-1", 35))).toBe(true);
    expect(canRemovePurchase(bull, "p-2", inseminated("bull-1", 40))).toBe(true);
  });

  it("refuses it when the doses of that purchase were already used", () => {
    expect(canRemovePurchase(bull, "p-1", inseminated("bull-1", 35))).toBe(false);
    expect(canRemovePurchase(bull, "p-2", inseminated("bull-1", 41))).toBe(false);
  });

  it("refuses an unknown purchase", () => {
    expect(canRemovePurchase(bull, "p-9", [])).toBe(false);
  });
});

describe("bullPregnancy", () => {
  it("counts only the pregnant and open diagnoses", () => {
    const animals = [
      cow("B-001", [breeding("b1", "2026-07-01", "bull-1")], [
        { breedingId: "b1", result: "pregnant", date: "2026-08-05" },
      ]),
      cow("B-002", [breeding("b2", "2026-07-01", "bull-1")], [
        { breedingId: "b2", result: "open", date: "2026-08-05" },
      ]),
      cow("B-003", [breeding("b3", "2026-07-01", "bull-1")], [
        { breedingId: "b3", result: "pending", date: "2026-08-05" },
      ]),
      cow("B-004", [breeding("b4", "2026-07-01", "bull-1")]),
      cow("B-005", [breeding("b5", "2026-07-01", "bull-2")], [
        { breedingId: "b5", result: "pregnant", date: "2026-08-05" },
      ]),
    ];

    expect(bullPregnancy("bull-1", animals)).toEqual({ diagnosed: 2, pregnant: 1, rate: 0.5 });
  });

  it("reads the diagnosis of the bull's cobertura, not of the dam's other ones", () => {
    const animals = [
      cow(
        "B-001",
        [breeding("b1", "2026-03-01", "bull-1"), breeding("b2", "2026-06-01", "bull-2")],
        [
          { breedingId: "b1", result: "open", date: "2026-04-05" },
          { breedingId: "b2", result: "pregnant", date: "2026-07-05" },
        ]
      ),
    ];

    expect(bullPregnancy("bull-1", animals)).toEqual({ diagnosed: 1, pregnant: 0, rate: 0 });
  });

  it("has no rate while nothing is diagnosed", () => {
    expect(bullPregnancy("bull-1", inseminated("bull-1", 2))).toEqual({
      diagnosed: 0,
      pregnant: 0,
      rate: null,
    });
  });
});

describe("bullInseminations", () => {
  it("lists the bull's coberturas newest first, then by dam, with the result", () => {
    const b002 = cow("B-002", [breeding("b2", "2026-07-01", "bull-1")], [
      { breedingId: "b2", result: "pregnant", date: "2026-08-05" },
    ]);
    const b001 = cow("B-001", [breeding("b1", "2026-07-01", "bull-1")]);
    const b003 = cow("B-003", [breeding("b3", "2026-05-01", "bull-1")], [
      { breedingId: "b3", result: "open", date: "2026-06-05" },
    ]);
    const other = cow("B-004", [breeding("b4", "2026-08-01", "bull-2")]);

    const list = bullInseminations("bull-1", [b002, b003, other, b001]);

    expect(list.map((i) => [i.dam.earTag, i.breeding.id, i.result])).toEqual([
      ["B-001", "b1", "pending"],
      ["B-002", "b2", "pregnant"],
      ["B-003", "b3", "open"],
    ]);
    expect(list[0].dam).toBe(b001);
  });
});

describe("sessionDosesByBull", () => {
  it("counts the done passes through the cobertura each one wrote", () => {
    const animals = [
      cow("B-001", [breeding("b1", "2026-07-01", "bull-1")]),
      cow("B-002", [breeding("b2", "2026-07-01", "bull-1")]),
      cow("B-003", [breeding("b3", "2026-07-01", "bull-2")]),
      cow("B-004", [breeding("b4", "2026-07-01")]),
    ];
    const session = makeManejoSession({
      animals: [
        { earTag: "B-001", outcome: "done", breedingId: "b1" },
        { earTag: "B-002", outcome: "done", breedingId: "b2" },
        { earTag: "B-003", outcome: "done", breedingId: "b3" },
        { earTag: "B-004", outcome: "done", breedingId: "b4" },
        { earTag: "B-005", outcome: "done" },
        { earTag: "B-006", outcome: "skipped" },
        { earTag: "B-007", outcome: "pending" },
      ],
    });

    expect(sessionDosesByBull(session, animals)).toEqual(
      new Map([
        ["bull-1", 2],
        ["bull-2", 1],
      ])
    );
  });
});

describe("sessionSemenCost", () => {
  const tufao = makeSemenBull({
    id: "bull-1",
    name: "Tufão da Serra",
    purchases: [purchase({ doses: 60, totalBrl: 2280 })],
  });
  const bravo = makeSemenBull({
    id: "bull-2",
    name: "Bravo",
    purchases: [purchase({ doses: 10, totalBrl: 500 })],
  });
  const semCompra = makeSemenBull({ id: "bull-3", name: "Sem Compra", purchases: [] });

  const animals = [
    cow("B-001", [breeding("b1", "2026-07-01", "bull-1")]),
    cow("B-002", [breeding("b2", "2026-07-01", "bull-1")]),
    cow("B-003", [breeding("b3", "2026-07-01", "bull-1")]),
    cow("B-004", [breeding("b4", "2026-07-01", "bull-2")]),
    cow("B-005", [breeding("b5", "2026-07-01", "bull-3")]),
  ];
  const session = makeManejoSession({
    animals: [
      ...animals.map((a, i) => ({
        earTag: a.earTag,
        outcome: "done" as const,
        breedingId: `b${i + 1}`,
      })),
      { earTag: "B-006", outcome: "skipped" as const },
    ],
  });

  it("prices each bull's doses at its average cost, most doses first", () => {
    const cost = sessionSemenCost(session, animals, [semCompra, bravo, tufao]);

    expect(cost.lines).toEqual([
      { bull: tufao, doses: 3, costBrl: 114, avgCostPerDose: 38 },
      { bull: bravo, doses: 1, costBrl: 50, avgCostPerDose: 50 },
      { bull: semCompra, doses: 1, costBrl: null, avgCostPerDose: null },
    ]);
    expect(cost.doses).toBe(5);
    expect(cost.totalBrl).toBe(164);
    expect(cost.perCowBrl).toBeCloseTo(164 / 5, 6);
  });

  it("has no total when no bull of the session has a cost", () => {
    const cost = sessionSemenCost(session, animals, [
      { ...tufao, purchases: [] },
      { ...bravo, purchases: [] },
      semCompra,
    ]);

    expect(cost.doses).toBe(5);
    expect(cost.totalBrl).toBeNull();
    expect(cost.perCowBrl).toBeNull();
  });

  it("has no money at all when the purchase totals were stripped", () => {
    const hide = (bull: typeof tufao) => ({
      ...bull,
      purchases: bull.purchases.map(({ id, date, doses }) => ({ id, date, doses })),
    });
    const cost = sessionSemenCost(session, animals, [hide(tufao), hide(bravo), semCompra]);

    expect(cost.lines.map((line) => [line.doses, line.costBrl, line.avgCostPerDose])).toEqual([
      [3, null, null],
      [1, null, null],
      [1, null, null],
    ]);
    expect(cost.doses).toBe(5);
    expect(cost.totalBrl).toBeNull();
    expect(cost.perCowBrl).toBeNull();
  });

  it("is empty for a session nobody passed yet", () => {
    expect(sessionSemenCost(makeManejoSession(), animals, [tufao])).toEqual({
      lines: [],
      doses: 0,
      totalBrl: null,
      perCowBrl: null,
    });
  });
});

describe("purchaseExpenseNotes", () => {
  it("names the bull and the doses bought", () => {
    expect(purchaseExpenseNotes("Tufão da Serra", 30)).toBe("Sêmen — Tufão da Serra, 30 doses");
    expect(purchaseExpenseNotes("Tufão da Serra", 1)).toBe("Sêmen — Tufão da Serra, 1 dose");
  });
});

describe("eligibleForInsemination", () => {
  it("takes the active cows and heifers", () => {
    expect(eligibleForInsemination(cow("B-001", []))).toBe(true);
    expect(eligibleForInsemination(cow("B-002", [], [], { category: "heifer" }))).toBe(true);
  });

  it("leaves out inactive animals, males and calves", () => {
    expect(eligibleForInsemination(cow("B-001", [], [], { active: false }))).toBe(false);
    expect(eligibleForInsemination(makeAnimal({ category: "bull", sex: "male" }))).toBe(false);
    expect(eligibleForInsemination(makeAnimal({ category: "steer", sex: "male" }))).toBe(false);
    expect(eligibleForInsemination(makeAnimal({ category: "calf", sex: "female" }))).toBe(false);
  });
});

describe("predominantLotId", () => {
  const animals = [
    cow("A", [], [], { lotId: "lot-2" }),
    cow("B", [], [], { lotId: "lot-1" }),
    cow("C", [], [], { lotId: "lot-1" }),
    cow("D", [], [], { lotId: "lot-3" }),
  ];

  it("takes the lote most of the animals are in now", () => {
    expect(predominantLotId(["A", "B", "C"], animals)).toBe("lot-1");
  });

  it("breaks a tie by lote id", () => {
    expect(predominantLotId(["D", "A"], animals)).toBe("lot-2");
  });

  it("ignores ear tags that are no longer in the herd", () => {
    expect(predominantLotId(["D", "X", "Y"], animals)).toBe("lot-3");
    expect(predominantLotId(["X"], animals)).toBeNull();
    expect(predominantLotId([], animals)).toBeNull();
  });
});

describe("inseminationBulls", () => {
  const tufao = makeSemenBull({ id: "sb-1", name: "Tufão da Serra" });
  const diamante = makeSemenBull({ id: "sb-2", name: "Diamante MB" });

  it("lists the touros of the session in the order picked", () => {
    const session = makeManejoSession({ semenBullIds: ["sb-2", "sb-1"] });
    expect(inseminationBulls(session, [tufao, diamante])).toEqual([diamante, tufao]);
  });

  it("skips a touro the store no longer has", () => {
    const session = makeManejoSession({ semenBullIds: ["sb-9", "sb-1"] });
    expect(inseminationBulls(session, [tufao, diamante])).toEqual([tufao]);
  });

  it("is empty for a session without touros", () => {
    expect(inseminationBulls(makeManejoSession(), [tufao])).toEqual([]);
    expect(inseminationBulls(makeManejoSession({ semenBullIds: [] }), [tufao])).toEqual([]);
  });
});
