import { describe, expect, it } from "vitest";
import type { Animal, ManejoSession, Treatment } from "@/lib/types";
import {
  calendarTotals,
  calendarTreatmentGroup,
  entryTotals,
  gainSince,
  looseWeighingLines,
  movementLines,
  outcomeNote,
  passedLabel,
  previousWeighing,
  sessionWeighingLines,
  transferOrigins,
  treatmentLines,
  treatmentTotals,
  visibleLines,
  weighingTotals,
  type DetailLine,
} from "@/lib/domain/manejoDetail";
import { makeAnimal, makeTreatment } from "./fixtures";

function session(overrides: Partial<ManejoSession> = {}): ManejoSession {
  return {
    id: "s-1",
    name: "Pesagem boiada",
    date: "2025-08-22",
    status: "closed",
    kind: "weighing",
    weighing: true,
    animals: [],
    ...overrides,
  };
}

const steer = (earTag: string, weighings: Animal["weighings"], over: Partial<Animal> = {}) =>
  makeAnimal({ id: `id-${earTag}`, earTag, weighings, ...over });

describe("visibleLines and outcomeNote", () => {
  const lines: DetailLine[] = [
    { earTag: "BR-001", outcome: "done" },
    { earTag: "BR-002", outcome: "skipped", notes: "mancando" },
    { earTag: "BR-010", outcome: "pending" },
  ];

  it("keeps the animals done unless the whole lot is asked for", () => {
    expect(visibleLines(lines, "passed", "").map((l) => l.earTag)).toEqual(["BR-001"]);
    expect(visibleLines(lines, "lot", "").map((l) => l.earTag)).toEqual(["BR-001", "BR-002", "BR-010"]);
  });

  it("searches inside the scope", () => {
    expect(visibleLines(lines, "passed", "002")).toEqual([]);
    expect(visibleLines(lines, "lot", " br-00").map((l) => l.earTag)).toEqual(["BR-001", "BR-002"]);
  });

  it("says why an animal did not pass", () => {
    expect(lines.map(outcomeNote)).toEqual(["", "pulado · mancando", "não passou"]);
  });
});

describe("previousWeighing and gainSince", () => {
  const animal = steer("BR-001", [
    { id: 1, date: "2025-05-18", weightKg: 472 },
    { id: 2, date: "2025-08-22", weightKg: 518 },
  ]);

  it("takes the last weighing strictly before the date", () => {
    expect(previousWeighing(animal, "2025-08-22")).toEqual({ date: "2025-05-18", weightKg: 472 });
    expect(previousWeighing(animal, "2025-05-18")).toBeNull();
    expect(previousWeighing(undefined, "2025-08-22")).toBeNull();
  });

  it("spreads the gain over the days between the weighings", () => {
    const gain = gainSince(518, "2025-08-22", { date: "2025-05-18", weightKg: 472 });
    expect(gain?.gainKg).toBe(46);
    expect(gain?.adgKgDay).toBeCloseTo(46 / 96, 6);
    expect(gainSince(518, "2025-08-22", null)).toBeNull();
    expect(gainSince(518, "2025-08-22", { date: "2025-08-22", weightKg: 500 })).toBeNull();
  });
});

describe("sessionWeighingLines and weighingTotals", () => {
  const animals = [
    steer("BR-001", [
      { id: 1, date: "2025-05-18", weightKg: 472 },
      { id: 11, date: "2025-08-22", weightKg: 518 },
    ]),
    steer("BR-002", [{ id: 12, date: "2025-08-22", weightKg: 529 }]),
    steer("BR-003", [{ id: 3, date: "2025-05-18", weightKg: 470 }]),
  ];
  const pesagem = session({
    animals: [
      { earTag: "BR-001", outcome: "done", weightKg: 518, weighingId: 11 },
      { earTag: "BR-002", outcome: "done", weightKg: 529, weighingId: 12, notes: "novo" },
      { earTag: "BR-003", outcome: "skipped" },
    ],
  });

  it("builds one line per animal of the session, in its order", () => {
    const lines = sessionWeighingLines(pesagem, animals);
    expect(lines.map((l) => [l.earTag, l.outcome, l.weightKg, l.previous?.weightKg ?? null, l.gain?.gainKg ?? null])).toEqual([
      ["BR-001", "done", 518, 472, 46],
      ["BR-002", "done", 529, null, null],
      ["BR-003", "skipped", null, 470, null],
    ]);
    expect(lines[1].notes).toBe("novo");
  });

  it("sums the lot and averages per head", () => {
    const totals = weighingTotals(sessionWeighingLines(pesagem, animals));
    expect(totals).toMatchObject({
      total: 3,
      passed: 2,
      skipped: 1,
      weighed: 2,
      totalKg: 1047,
      avgKg: 523.5,
      withPrevious: 1,
      totalGainKg: 46,
      avgGainKg: 46,
      atBirth: 0,
      avgAtBirthKg: null,
    });
    expect(totals.avgAdgKgDay).toBeCloseTo(46 / 96, 6);
  });

  it("leaves the averages empty when nobody was weighed", () => {
    expect(weighingTotals([])).toMatchObject({ weighed: 0, totalKg: null, avgKg: null, totalGainKg: null, avgAdgKgDay: null });
  });
});

describe("looseWeighingLines", () => {
  it("lists the weighings of the day no session wrote and marks birth weights", () => {
    const animals = [
      steer("BB97", [{ id: 5, date: "2025-10-06", weightKg: 28 }], { birthDate: "2025-10-06", category: "calf" }),
      steer("BR-0588", [
        { id: 6, date: "2025-09-12", weightKg: 332 },
        { id: 7, date: "2025-10-06", weightKg: 341 },
      ]),
      steer("BR-0700", [{ id: 8, date: "2025-10-06", weightKg: 500 }]),
    ];
    const sessions = [session({ date: "2025-10-06", animals: [{ earTag: "BR-0700", outcome: "done", weightKg: 500, weighingId: 8 }] })];

    const lines = looseWeighingLines("2025-10-06", animals, sessions);
    expect(lines.map((l) => [l.earTag, l.weightKg, l.atBirth, l.gain?.gainKg ?? null])).toEqual([
      ["BB97", 28, true, null],
      ["BR-0588", 341, false, 9],
    ]);
    expect(weighingTotals(lines)).toMatchObject({ atBirth: 1, avgAtBirthKg: 28, weighed: 2 });
  });
});

describe("treatmentLines and treatmentTotals", () => {
  const vacina = session({
    kind: "health",
    name: "Aftosa maio",
    date: "2025-05-15",
    weighing: false,
    treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 30, dose: "2 ml", costBrl: 3.2, nextDate: "2025-11-15" },
    animals: [
      { earTag: "BR-001", outcome: "done", treatmentId: "t1", boosterId: "b1" },
      { earTag: "BR-002", outcome: "done", treatmentId: "t2", boosterId: "b2" },
      { earTag: "BR-003", outcome: "skipped", notes: "bezerro novo" },
    ],
  });

  it("charges the plan's cost to each animal treated", () => {
    expect(treatmentLines(vacina).map((l) => [l.earTag, l.costBrl, l.weightKg])).toEqual([
      ["BR-001", 3.2, null],
      ["BR-002", 3.2, null],
      ["BR-003", null, null],
    ]);
  });

  it("dates the end of the carência and counts the boosters", () => {
    expect(treatmentTotals(vacina)).toEqual({
      total: 3,
      passed: 2,
      skipped: 1,
      withdrawalUntil: "2025-06-14",
      costTotalBrl: 6.4,
      costPerHeadBrl: 3.2,
      boosterDate: "2025-11-15",
      boosters: 2,
      weighed: 0,
      avgKg: null,
    });
  });

  it("has no carência, cost or booster when the plan has none, and averages weights taken", () => {
    const totals = treatmentTotals(
      session({
        kind: "health",
        treatment: { type: "deworming", name: "Ivermectina", withdrawalDays: 0 },
        animals: [
          { earTag: "BR-001", outcome: "done", weightKg: 300 },
          { earTag: "BR-002", outcome: "done", weightKg: 320 },
        ],
      })
    );
    expect(totals).toMatchObject({ withdrawalUntil: null, costTotalBrl: null, costPerHeadBrl: null, boosterDate: null, weighed: 2, avgKg: 310 });
  });
});

describe("calendarTreatmentGroup and calendarTotals", () => {
  const treatments: Treatment[] = [
    makeTreatment({ id: "c1", animalEarTag: "BR-001", type: "deworming", name: "Ivermectina", date: "2025-07-20", status: "done", withdrawalDays: 28, costBrl: 3.2 }),
    makeTreatment({ id: "c2", animalEarTag: "BR-002", type: "deworming", name: "Ivermectina", date: "2025-07-20", status: "done", withdrawalDays: 35, costBrl: 3.2 }),
    makeTreatment({ id: "s1", animalEarTag: "BR-003", type: "deworming", name: "Ivermectina", date: "2025-07-20", status: "done", withdrawalDays: 28 }),
    makeTreatment({ id: "x1", animalEarTag: "BR-004", type: "deworming", name: "Ivermectina", date: "2025-07-20", status: "scheduled", withdrawalDays: 28 }),
  ];
  const sessions = [session({ kind: "health", animals: [{ earTag: "BR-003", outcome: "done", treatmentId: "s1" }] })];

  it("gathers the done treatments of the same day, type and name that no session wrote", () => {
    const group = calendarTreatmentGroup("c2", treatments, sessions);
    expect(group && { ...group, treatments: group.treatments.map((t) => t.id) }).toEqual({
      date: "2025-07-20",
      type: "deworming",
      name: "Ivermectina",
      treatments: ["c1", "c2"],
    });
  });

  it("finds nothing for an unknown treatment or one a session wrote", () => {
    expect(calendarTreatmentGroup("nope", treatments, sessions)).toBeNull();
    expect(calendarTreatmentGroup("s1", treatments, sessions)).toBeNull();
    expect(calendarTreatmentGroup("x1", treatments, sessions)).toBeNull();
  });

  it("takes the longest carência and sums the costs", () => {
    const group = calendarTreatmentGroup("c1", treatments, sessions)!;
    expect(calendarTotals(group)).toEqual({
      heads: 2,
      withdrawalUntil: "2025-08-24",
      costTotalBrl: 6.4,
      costPerHeadBrl: 3.2,
    });
  });
});

describe("movements", () => {
  const troca = session({
    kind: "transfer",
    weighing: false,
    destinationLotId: "lot-recria",
    animals: [
      { earTag: "BR-001", outcome: "done", previousLotId: "lot-cria" },
      { earTag: "BR-002", outcome: "done", previousLotId: "lot-novilhas" },
      { earTag: "BR-003", outcome: "done", previousLotId: "lot-cria" },
      { earTag: "BR-004", outcome: "done" },
      { earTag: "BR-005", outcome: "skipped", previousLotId: "lot-novilhas" },
    ],
  });

  it("lists each animal with the lote it left", () => {
    expect(movementLines(troca).map((l) => [l.earTag, l.previousLotId ?? null])).toEqual([
      ["BR-001", "lot-cria"],
      ["BR-002", "lot-novilhas"],
      ["BR-003", "lot-cria"],
      ["BR-004", null],
      ["BR-005", "lot-novilhas"],
    ]);
  });

  it("counts where the animals done came from, most first", () => {
    expect(transferOrigins(troca)).toEqual([
      { lotId: "lot-cria", heads: 2 },
      { lotId: "lot-novilhas", heads: 1 },
      { lotId: null, heads: 1 },
    ]);
  });

  it("prices an entrada per head and per arroba only when every animal was weighed", () => {
    const compra = session({
      kind: "entry",
      totalAmountBrl: 6000,
      animals: [
        { earTag: "BV-1", outcome: "done", weightKg: 210 },
        { earTag: "BV-2", outcome: "done", weightKg: 240 },
      ],
    });
    expect(entryTotals(compra)).toEqual({
      heads: 2,
      weighed: 2,
      avgKg: 225,
      totalBrl: 6000,
      perHeadBrl: 3000,
      perArrobaBrl: 400,
    });
    const partial = { ...compra, animals: [...compra.animals, { earTag: "BV-3", outcome: "done" as const }] };
    expect(entryTotals(partial)).toMatchObject({ heads: 3, weighed: 2, perHeadBrl: 2000, perArrobaBrl: null });
  });
});

describe("passedLabel", () => {
  it("names what happened to the animals that passed", () => {
    expect(passedLabel(session())).toBe("pesadas");
    expect(passedLabel(session({ kind: "health", treatment: { type: "vaccine", name: "A", withdrawalDays: 0 } }))).toBe("vacinadas");
    expect(passedLabel(session({ kind: "health", treatment: { type: "deworming", name: "A", withdrawalDays: 0 } }))).toBe("vermifugadas");
    expect(passedLabel(session({ kind: "health", treatment: { type: "medication", name: "A", withdrawalDays: 0 } }))).toBe("medicadas");
    expect(passedLabel(session({ kind: "health", treatment: { type: "exam", name: "A", withdrawalDays: 0 } }))).toBe("examinadas");
    expect(passedLabel(session({ kind: "transfer" }))).toBe("transferidas");
    expect(passedLabel(session({ kind: "entry" }))).toBe("recebidas");
    expect(passedLabel(session({ kind: "sale" }))).toBe("vendidas");
    expect(passedLabel(session({ kind: "insemination" }))).toBe("inseminadas");
  });
});
