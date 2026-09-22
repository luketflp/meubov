import { describe, expect, it } from "vitest";
import type {
  Animal,
  Invernada,
  Lot,
  LotPlacement,
  Movement,
  ReproductionRecord,
} from "@/lib/types";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import { addDays } from "@/lib/domain/dates";
import { GESTATION_DAYS } from "@/lib/domain/reproduction";
import {
  adgChange,
  calvingCalendar,
  farmAgenda,
  herdFlow,
  lotsUpToDate,
  nextCalvings,
  seasonReproduction,
  type AgendaInput,
} from "@/lib/store/dashboard";

const TODAY = "2026-09-22";

const lots: Lot[] = [
  { id: "lot-cria", name: "Matrizes com cria" },
  { id: "lot-garrotes", name: "Garrotes" },
  { id: "lot-novilhas", name: "Novilhas" },
];
const invernadas: Invernada[] = [
  { id: "inv-1", code: "01", name: "Baixada", grass: "Brachiaria", hectares: 105 },
];
const lotPlacements: LotPlacement[] = [
  { id: "p-1", lotId: "lot-cria", invernadaId: "inv-1", startedOn: "2026-01-10" },
];

const input = (partial: Partial<AgendaInput>): AgendaInput => ({
  animals: [],
  treatments: [],
  lots,
  invernadas,
  lotPlacements,
  ...partial,
});

/** The cobertura date whose calving is expected on `expected`. */
const bredFor = (expected: string): string => addDays(expected, -GESTATION_DAYS);

const bred = (date: string): ReproductionRecord => ({
  breedings: [{ id: `b-${date}`, date, type: "timedAI", bullEarTag: "T-1" }],
  diagnoses: [],
  calvings: [],
});

const pregnant = (date: string): ReproductionRecord => ({
  ...bred(date),
  diagnoses: [{ breedingId: `b-${date}`, result: "pregnant", date: addDays(date, 40) }],
});

const cow = (
  earTag: string,
  lotId: string,
  reproduction?: ReproductionRecord,
  overrides: Partial<Animal> = {}
): Animal =>
  makeAnimal({
    id: `cow-${earTag}`,
    earTag,
    category: "cow",
    sex: "female",
    lotId,
    reproduction,
    ...overrides,
  });

const steer = (earTag: string, lotId: string, overrides: Partial<Animal> = {}): Animal =>
  makeAnimal({ id: `steer-${earTag}`, earTag, lotId, ...overrides });

describe("farmAgenda", () => {
  it("groups a lote's pending treatments by date, type and name, up to 7 days ahead", () => {
    const animals = [steer("G1", "lot-garrotes"), steer("G2", "lot-garrotes")];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "G1", name: "Clostridiose", date: "2026-09-20" }),
      makeTreatment({ id: "t2", animalEarTag: "G2", name: "Clostridiose", date: "2026-09-20" }),
      makeTreatment({ id: "t3", animalEarTag: "G1", name: "Raiva", date: "2026-09-29" }),
      makeTreatment({ id: "t4", animalEarTag: "G1", name: "Carrapaticida", date: "2026-09-30" }),
      makeTreatment({ id: "t5", animalEarTag: "G2", name: "Brucelose", date: "2026-09-10", status: "done" }),
    ];

    const [garrotes] = farmAgenda(input({ animals, treatments }), TODAY);

    expect(garrotes.items).toEqual([
      expect.objectContaining({
        kind: "treatment",
        name: "Clostridiose",
        urgency: 0,
        date: "2026-09-20",
        treatmentIds: ["t1", "t2"],
        earTags: ["G1", "G2"],
      }),
      expect.objectContaining({ kind: "treatment", name: "Raiva", urgency: 2, date: "2026-09-29" }),
    ]);
  });

  it("puts each animal's treatment in the lote it stands in today", () => {
    const animals = [steer("G1", "lot-garrotes"), steer("N1", "lot-novilhas")];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "G1", name: "Raiva", date: TODAY }),
      makeTreatment({ id: "t2", animalEarTag: "N1", name: "Raiva", date: TODAY }),
    ];

    const agenda = farmAgenda(input({ animals, treatments }), TODAY);

    expect(agenda.map((group) => [group.name, group.items[0].urgency, group.items[0].earTags])).toEqual([
      ["Garrotes", 1, ["G1"]],
      ["Novilhas", 1, ["N1"]],
    ]);
  });

  it("leaves out the treatments of animals that left the herd or do not resolve", () => {
    const animals = [steer("G1", "lot-garrotes", { active: false, inactiveReason: "sale" })];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "G1", date: "2026-09-20" }),
      makeTreatment({ id: "t2", animalEarTag: "XX", date: "2026-09-20" }),
    ];

    expect(farmAgenda(input({ animals, treatments }), TODAY)).toEqual([]);
  });

  it("lists calvings due without a parto, calvings in the next days and diagnoses waiting 30 days", () => {
    const animals = [
      cow("4471", "lot-cria", pregnant(bredFor("2026-09-19"))),
      cow("3982", "lot-cria", pregnant(bredFor("2026-09-15"))),
      cow("2087", "lot-cria", pregnant(bredFor("2026-09-23"))),
      cow("9001", "lot-cria", pregnant(bredFor("2026-10-30"))),
      cow("5120", "lot-cria", bred("2026-08-10")),
      cow("5121", "lot-cria", bred("2026-09-10")),
      cow("5122", "lot-cria", {
        ...pregnant(bredFor("2026-09-01")),
        calvings: [{ date: "2026-09-02", calfEarTag: "B-1" }],
      }),
    ];

    const [cria] = farmAgenda(input({ animals }), TODAY);

    expect(cria.items).toEqual([
      {
        kind: "overdueCalvings",
        key: "lot-cria|overdueCalvings",
        urgency: 0,
        date: "2026-09-15",
        until: "2026-09-19",
        earTags: ["3982", "4471"],
      },
      {
        kind: "pendingDiagnosis",
        key: "lot-cria|pendingDiagnosis",
        urgency: 1,
        date: "2026-08-10",
        until: "2026-08-10",
        earTags: ["5120"],
      },
      {
        kind: "upcomingCalvings",
        key: "lot-cria|upcomingCalvings",
        urgency: 2,
        date: "2026-09-23",
        until: "2026-09-23",
        earTags: ["2087"],
      },
    ]);
  });

  it("orders the lotes by their most urgent item and describes each lote", () => {
    const animals = [
      cow("C1", "lot-cria"),
      cow("C2", "lot-cria"),
      steer("G1", "lot-garrotes"),
      steer("N1", "lot-novilhas"),
      steer("X1", "lot-gone"),
    ];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "N1", name: "Vermífugo", date: TODAY }),
      makeTreatment({ id: "t2", animalEarTag: "G1", name: "Clostridiose", date: "2026-09-20" }),
      makeTreatment({ id: "t3", animalEarTag: "C1", name: "Brucelose", date: "2026-09-16" }),
      makeTreatment({ id: "t4", animalEarTag: "X1", name: "Raiva", date: "2026-09-12" }),
    ];

    const agenda = farmAgenda(input({ animals, treatments }), TODAY);

    expect(agenda.map((group) => group.name)).toEqual([
      "Matrizes com cria",
      "Garrotes",
      "Novilhas",
      null,
    ]);
    expect(agenda[0]).toMatchObject({ lotId: "lot-cria", heads: 2, invernada: invernadas[0] });
    expect(agenda[1].invernada).toBeNull();
    expect(agenda[3]).toMatchObject({ lotId: null, name: null, heads: 1 });
  });
});

describe("lotsUpToDate", () => {
  it("lists the lotes with active animals the agenda leaves out, by name", () => {
    const animals = [
      steer("G1", "lot-garrotes"),
      cow("C1", "lot-cria"),
      cow("C2", "lot-cria"),
      steer("N1", "lot-novilhas"),
    ];
    const treatments = [makeTreatment({ id: "t1", animalEarTag: "N1", name: "Raiva", date: TODAY })];
    const data = input({ animals, treatments });

    expect(lotsUpToDate(data, farmAgenda(data, TODAY))).toEqual([
      { lotId: "lot-garrotes", name: "Garrotes", invernada: null, heads: 1 },
      { lotId: "lot-cria", name: "Matrizes com cria", invernada: invernadas[0], heads: 2 },
    ]);
  });

  it("leaves out lotes with no active animal and deleted lotes", () => {
    const data = input({
      animals: [
        steer("G1", "lot-garrotes", { active: false }),
        steer("V1", "lot-velho"),
      ],
      lots: [...lots, { id: "lot-velho", name: "Velho", deletedAt: "2026-09-01T00:00:00Z" }],
    });

    expect(lotsUpToDate(data, farmAgenda(data, TODAY))).toEqual([]);
  });
});

describe("herdFlow", () => {
  it("walks from the herd 12 months ago to today through births, purchases and exits", () => {
    const animals = [
      cow("C1", "lot-cria", {
        breedings: [],
        diagnoses: [],
        calvings: [
          { date: "2026-08-10", calfEarTag: "B1" },
          { date: "2025-09-20", calfEarTag: "B0" },
        ],
      }),
      makeAnimal({ id: "b1", earTag: "B1", category: "calf" }),
      makeAnimal({ id: "p1", earTag: "P1" }),
      makeAnimal({ id: "p2", earTag: "P2" }),
      makeAnimal({ id: "s1", earTag: "S1", active: false, inactiveReason: "sale", inactiveDate: "2026-05-02" }),
      makeAnimal({ id: "s0", earTag: "S0", active: false, inactiveReason: "sale", inactiveDate: "2025-09-30" }),
      makeAnimal({ id: "d1", earTag: "D1", active: false, inactiveReason: "death", inactiveDate: "2026-01-15" }),
      makeAnimal({ id: "l1", earTag: "L1", active: false, inactiveReason: "loss", inactiveDate: "2026-02-15" }),
      makeAnimal({ id: "o1", earTag: "O1", active: false, inactiveReason: "other", inactiveDate: "2026-03-15" }),
    ];
    const movements: Movement[] = [
      { id: "m1", type: "purchase", date: "2026-04-01", quantity: 2, origin: "Leilão", destination: "Garrotes", amountBrl: 9000 },
      { id: "m2", type: "purchase", date: "2025-08-01", quantity: 5, origin: "Leilão", destination: "Garrotes" },
      { id: "m3", type: "sale", date: "2026-05-02", quantity: 1, origin: "Garrotes", destination: "Frigorífico" },
    ];

    expect(herdFlow(animals, movements, TODAY)).toEqual({
      since: "2025-10-01",
      start: 5,
      births: 1,
      purchases: 2,
      sales: 1,
      deaths: 2,
      others: 1,
      end: 4,
    });
  });

  it("never starts below zero", () => {
    const movements: Movement[] = [
      { id: "m1", type: "purchase", date: "2026-04-01", quantity: 3, origin: "Leilão", destination: "Garrotes" },
    ];

    expect(herdFlow([makeAnimal()], movements, TODAY).start).toBe(0);
  });
});

describe("seasonReproduction", () => {
  it("counts the season's coberturas, a calving standing for a pregnancy", () => {
    const animals = [
      cow("A", "lot-cria", pregnant("2026-01-10")),
      cow("B", "lot-cria", {
        ...bred("2026-01-12"),
        diagnoses: [{ breedingId: "b-2026-01-12", result: "open", date: "2026-03-01" }],
      }),
      cow("C", "lot-cria", { ...bred("2025-11-20"), calvings: [{ date: "2026-08-30", calfEarTag: "BC" }] }),
      cow("D", "lot-cria", bred("2026-08-01")),
      cow("E", "lot-cria", pregnant("2025-06-01")),
      cow("F", "lot-cria", pregnant("2026-02-01"), { active: false, inactiveReason: "sale" }),
    ];

    expect(seasonReproduction(animals, TODAY)).toEqual({
      exposed: 4,
      diagnosed: 3,
      pregnant: 2,
      calved: 1,
      awaiting: 1,
      ratePct: (2 / 3) * 100,
    });
  });

  it("has no rate before the first diagnosis", () => {
    expect(seasonReproduction([cow("D", "lot-cria", bred("2026-08-01"))], TODAY)).toMatchObject({
      exposed: 1,
      diagnosed: 0,
      ratePct: null,
    });
  });
});

describe("calvingCalendar", () => {
  it("counts the calvings recorded and the ones still expected, two months back to three ahead", () => {
    const animals = [
      cow("A", "lot-cria", {
        breedings: [],
        diagnoses: [],
        calvings: [
          { date: "2026-07-05", calfEarTag: "x" },
          { date: "2026-09-02", calfEarTag: "y" },
          { date: "2026-03-01", calfEarTag: "z" },
        ],
      }),
      cow("B", "lot-cria", pregnant(bredFor("2026-09-30"))),
      cow("C", "lot-cria", pregnant(bredFor("2026-12-05"))),
      cow("D", "lot-cria", pregnant(bredFor("2026-09-10"))),
      cow("E", "lot-cria", pregnant(bredFor("2027-02-01"))),
    ];

    expect(calvingCalendar(animals, TODAY)).toEqual([
      { date: "2026-07-01", born: 1, due: 0 },
      { date: "2026-08-01", born: 0, due: 0 },
      { date: "2026-09-01", born: 1, due: 1 },
      { date: "2026-10-01", born: 0, due: 0 },
      { date: "2026-11-01", born: 0, due: 0 },
      { date: "2026-12-01", born: 0, due: 1 },
    ]);
  });
});

describe("nextCalvings", () => {
  it("lists the calvings still ahead, nearest first, up to the limit", () => {
    const animals = [
      cow("X30", "lot-cria", pregnant(bredFor("2026-10-02"))),
      cow("X25", "lot-cria", pregnant(bredFor("2026-09-25"))),
      cow("X22", "lot-cria", pregnant(bredFor(TODAY))),
      cow("X10", "lot-cria", pregnant(bredFor("2026-09-10"))),
      cow("X26", "lot-cria", pregnant(bredFor("2026-09-25")), { active: false }),
    ];

    expect(nextCalvings(animals, TODAY, 2).map((c) => [c.dam.earTag, c.date])).toEqual([
      ["X22", TODAY],
      ["X25", "2026-09-25"],
    ]);
  });
});

describe("adgChange", () => {
  it("is the last month's GMD minus the month before", () => {
    expect(
      adgChange([
        { month: "ago/26", averageAdg: 0.46 },
        { month: "set/26", averageAdg: 0.58 },
      ])
    ).toBeCloseTo(0.12);
  });

  it("is null without two months to compare", () => {
    expect(adgChange([{ month: "set/26", averageAdg: 0.58 }])).toBeNull();
    expect(
      adgChange([
        { month: "ago/26", averageAdg: 0.46 },
        { month: "set/26", averageAdg: null },
      ])
    ).toBeNull();
  });
});
