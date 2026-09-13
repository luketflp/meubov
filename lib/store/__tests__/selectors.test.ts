import { describe, expect, it } from "vitest";
import type {
  Animal,
  Breeding,
  Calving,
  Invernada,
  Lot,
  LotPlacement,
  ManejoSession,
  ReproductionRecord,
  SemenBull,
  Treatment,
} from "@/lib/types";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import {
  animalById,
  animalsByBreed,
  canDeleteLot,
  currentlyPlacedLots,
  filterBreedings,
  herdStockingRateAuPerHa,
  invernadasWithSummary,
  lotSummary,
  lotsByInvernada,
  lotsWithSummary,
  recentBirths,
  recentBreedings,
  treatmentBatchSize,
  withStatus,
} from "@/lib/store/selectors";

describe("animalById", () => {
  it("finds an animal independently of URL-sensitive ear-tag characters", () => {
    const animal = makeAnimal({ id: "animal-123", earTag: "S/N" });

    expect(animalById([animal], "animal-123")).toBe(animal);
  });

  it("does not treat an ear tag as the stable id", () => {
    const animal = makeAnimal({ id: "animal-123", earTag: "S/N" });

    expect(animalById([animal], "S/N")).toBeUndefined();
  });
});

const invernadas: Invernada[] = [
  {
    id: "invernada-1",
    code: "01",
    name: "Baixada",
    grass: "Mombaça",
    hectares: 10,
  },
  {
    id: "invernada-2",
    code: "02",
    name: "Sede",
    grass: "Tifton 85",
    hectares: 20,
  },
  {
    id: "invernada-3",
    code: "03",
    name: "Reserva",
    grass: "Andropogon",
    hectares: 30,
  },
];

const lots: Lot[] = [
  { id: "lot-1", name: "Matrizes" },
  { id: "lot-2", name: "Recria" },
];

const placements: LotPlacement[] = [
  {
    id: "placement-old",
    lotId: "lot-1",
    invernadaId: "invernada-2",
    startedOn: "2026-01-01",
    endedOn: "2026-07-01",
  },
  {
    id: "placement-current-1",
    lotId: "lot-1",
    invernadaId: "invernada-1",
    startedOn: "2026-07-01",
  },
  {
    id: "placement-current-2",
    lotId: "lot-2",
    invernadaId: "invernada-1",
    startedOn: "2026-04-10",
  },
];

const animals = [
  makeAnimal({
    id: "animal-1",
    earTag: "001",
    lotId: "lot-1",
    weighings: [{ date: "2026-07-20", weightKg: 450 }],
  }),
  makeAnimal({
    id: "animal-2",
    earTag: "002",
    lotId: "lot-2",
    weighings: [{ date: "2026-07-20", weightKg: 900 }],
  }),
  makeAnimal({
    id: "animal-sold",
    earTag: "003",
    lotId: "lot-2",
    active: false,
    weighings: [{ date: "2026-07-20", weightKg: 450 }],
  }),
];

describe("lot and invernada summaries", () => {
  it("offers only currently placed lots for new animal assignments", () => {
    const archived = { id: "lot-archived", name: "Encerrado" };

    expect(
      currentlyPlacedLots([...lots, archived], placements).map((lot) => lot.id)
    ).toEqual(["lot-1", "lot-2"]);
  });

  it("aggregates multiple logical lots in the same invernada", () => {
    const [summary] = invernadasWithSummary(invernadas, lots, placements, animals);

    expect(summary.invernada.id).toBe("invernada-1");
    expect(summary.lots.map((lot) => lot.id)).toEqual(["lot-1", "lot-2"]);
    expect(summary.headCount).toBe(2);
    expect(summary.totalWeightKg).toBe(1350);
    expect(summary.auPerHa).toBeCloseTo(0.3);
  });

  it("keeps an empty physical pasture in the result with zero occupancy", () => {
    const summaries = invernadasWithSummary(invernadas, lots, placements, animals);
    const empty = summaries.find((summary) => summary.invernada.id === "invernada-3");

    expect(empty).toMatchObject({
      lots: [],
      headCount: 0,
      totalWeightKg: 0,
      auPerHa: 0,
      classification: "light",
    });
  });

  it("excludes inactive animals from lot, invernada, and herd totals", () => {
    const lotSummaries = lotsWithSummary(lots, animals, invernadas, placements);
    const recria = lotSummaries.find((summary) => summary.lot.id === "lot-2");

    expect(recria?.headCount).toBe(1);
    expect(recria?.totalWeightKg).toBe(900);
    expect(herdStockingRateAuPerHa(animals, invernadas)).toBeCloseTo(0.05);
  });

  it("blocks deletion for a live herd or an open manejo, never for history", () => {
    const makeSession = (overrides: Partial<ManejoSession>): ManejoSession => ({
      id: "session-1",
      name: "Transferência",
      date: "2026-07-10",
      status: "closed",
      kind: "transfer",
      weighing: false,
      animals: [],
      ...overrides,
    });

    // Empty lot: deletable even with placements and manejos behind it, since
    // the row survives the deletion to keep naming that history.
    expect(canDeleteLot("lot-new", [], [])).toBe(true);
    expect(
      canDeleteLot("lot-new", [], [makeSession({ destinationLotId: "lot-new" })])
    ).toBe(true);
    expect(
      canDeleteLot("lot-new", [], [
        makeSession({
          animals: [{ earTag: "001", outcome: "done", previousLotId: "lot-new" }],
        }),
      ])
    ).toBe(true);

    // A sold or dead animal is history too.
    const dead = makeAnimal({ id: "animal-dead", lotId: "lot-new", active: false });
    expect(canDeleteLot("lot-new", [dead], [])).toBe(true);

    // A live animal, or an open manejo heading into the lot, would be stranded.
    const alive = makeAnimal({ id: "animal-live", lotId: "lot-new" });
    expect(canDeleteLot("lot-new", [alive], [])).toBe(false);
    expect(
      canDeleteLot("lot-new", [], [
        makeSession({ status: "open", destinationLotId: "lot-new" }),
      ])
    ).toBe(false);
  });

  it("hides a deleted lot from the lots list, the pickers and the invernadas", () => {
    const deleted: Lot = {
      ...lots[1],
      deletedAt: "2026-09-01T12:00:00.000Z",
    };
    const withDeleted = [lots[0], deleted];

    expect(
      lotsWithSummary(withDeleted, animals, invernadas, placements).map(
        (summary) => summary.lot.id
      )
    ).toEqual(["lot-1"]);
    expect(currentlyPlacedLots(withDeleted, placements).map((lot) => lot.id)).toEqual([
      "lot-1",
    ]);
    const [invernada1] = invernadasWithSummary(
      invernadas,
      withDeleted,
      placements,
      animals
    );
    expect(invernada1.lots.map((lot) => lot.id)).toEqual(["lot-1"]);
  });

  it("uses the open placement after a movement, not the closed historical one", () => {
    const [matrizes] = lotsWithSummary(
      [lots[0]],
      animals,
      invernadas,
      placements
    );
    const summaries = invernadasWithSummary(invernadas, lots, placements, animals);
    const formerPasture = summaries.find(
      (summary) => summary.invernada.id === "invernada-2"
    );

    expect(matrizes.currentPlacement?.id).toBe("placement-current-1");
    expect(matrizes.currentInvernada?.id).toBe("invernada-1");
    expect(formerPasture?.lots).toEqual([]);
    expect(formerPasture?.headCount).toBe(0);
  });
});

describe("recentBirths", () => {
  const calf = (earTag: string, overrides: Partial<Animal> = {}): Animal =>
    makeAnimal({ id: `calf-${earTag}`, earTag, category: "calf", ...overrides });

  const dam = (id: string, calvings: Calving[], overrides: Partial<Animal> = {}): Animal =>
    makeAnimal({
      id,
      earTag: id.toUpperCase(),
      category: "cow",
      sex: "female",
      reproduction: { breedings: [], diagnoses: [], calvings },
      ...overrides,
    });

  it("lists every calving across the herd, newest first", () => {
    const animals = [
      dam("dam-1", [
        { date: "2026-01-10", calfEarTag: "BR-101" },
        { date: "2026-03-02", calfEarTag: "BR-103" },
      ]),
      dam("dam-2", [{ date: "2026-02-20", calfEarTag: "BR-102" }]),
      calf("BR-101"),
      calf("BR-102"),
      calf("BR-103"),
    ];

    expect(recentBirths(animals).map((b) => b.calfEarTag)).toEqual([
      "BR-103",
      "BR-102",
      "BR-101",
    ]);
  });

  it("joins the calf record and its birth weight", () => {
    const animals = [
      dam("dam-1", [{ date: "2026-03-02", calfEarTag: "BR-103" }]),
      calf("BR-103", {
        sex: "female",
        weighings: [
          { date: "2026-03-02", weightKg: 32 },
          { date: "2026-06-02", weightKg: 120 },
        ],
      }),
    ];

    const [birth] = recentBirths(animals);

    expect(birth.dam.id).toBe("dam-1");
    expect(birth.calf?.sex).toBe("female");
    expect(birth.birthWeightKg).toBe(32);
  });

  it("has no birth weight when the calf was never weighed on the calving day", () => {
    const animals = [
      dam("dam-1", [{ date: "2026-03-02", calfEarTag: "BR-103" }]),
      calf("BR-103", { weighings: [{ date: "2026-06-02", weightKg: 120 }] }),
    ];

    expect(recentBirths(animals)[0].birthWeightKg).toBeNull();
  });

  it("keeps the birth when the calf's ear tag no longer resolves", () => {
    const animals = [dam("dam-1", [{ date: "2026-03-02", calfEarTag: "BR-103" }])];

    const [birth] = recentBirths(animals);

    expect(birth.calfEarTag).toBe("BR-103");
    expect(birth.calf).toBeNull();
  });

  it("keeps the births of a dam that has since left the herd", () => {
    const animals = [
      dam("dam-1", [{ date: "2026-03-02", calfEarTag: "BR-103" }], {
        active: false,
        inactiveReason: "sale",
      }),
    ];

    expect(recentBirths(animals)).toHaveLength(1);
  });

  it("ignores animals with no reproduction record", () => {
    expect(recentBirths([makeAnimal(), dam("dam-1", [])])).toEqual([]);
  });
});

describe("recentBreedings", () => {
  const breeding = (id: string, date: string, bullEarTag = "T-10"): Breeding => ({
    id,
    date,
    type: "timedAI",
    bullEarTag,
  });

  const dam = (
    id: string,
    record: Partial<ReproductionRecord>,
    overrides: Partial<Animal> = {}
  ): Animal =>
    makeAnimal({
      id,
      earTag: id.toUpperCase(),
      category: "cow",
      sex: "female",
      reproduction: { breedings: [], diagnoses: [], calvings: [], ...record },
      ...overrides,
    });

  const bull = (earTag: string): Animal =>
    makeAnimal({ id: `bull-${earTag}`, earTag, category: "bull" });

  it("lists every breeding across the herd, newest first, then by dam ear tag", () => {
    const animals = [
      dam("dam-2", { breedings: [breeding("c1", "2026-03-02")] }),
      dam("dam-1", {
        breedings: [breeding("c2", "2026-03-02"), breeding("c3", "2026-01-10")],
      }),
      dam("dam-3", { breedings: [breeding("c4", "2026-02-20")] }),
    ];

    expect(recentBreedings(animals, []).map((row) => row.key)).toEqual([
      "c2",
      "c1",
      "c4",
      "c3",
    ]);
  });

  it("joins the dam, the bull and the outcome of the breeding", () => {
    const covered = breeding("c1", "2026-01-01", "T-10");
    const diagnosis = { breedingId: "c1", result: "pregnant" as const, date: "2026-02-05" };
    const animals = [
      dam("dam-1", { breedings: [covered], diagnoses: [diagnosis] }),
      bull("T-10"),
    ];

    const [row] = recentBreedings(animals, []);

    expect(row.key).toBe("c1");
    expect(row.breeding).toBe(covered);
    expect(row.dam.id).toBe("dam-1");
    expect(row.bull?.id).toBe("bull-T-10");
    expect(row.outcome).toEqual({
      result: "pregnant",
      diagnosis,
      expectedCalvingDate: "2026-10-11",
    });
  });

  it("has no bull when the tag is an external bull or a semen code", () => {
    const animals = [
      dam("dam-1", { breedings: [breeding("c1", "2026-01-01", "SEMEN-4521")] }),
      bull("T-10"),
    ];

    const [row] = recentBreedings(animals, []);

    expect(row.breeding.bullEarTag).toBe("SEMEN-4521");
    expect(row.bull).toBeNull();
    expect(row.semenBull).toBeNull();
  });

  it("resolves the registered semen bull whose dose the breeding used", () => {
    const tufao: SemenBull = { id: "sb-1", name: "Tufão da Serra", code: "NEL-4471", purchases: [] };
    const other: SemenBull = { id: "sb-2", name: "Bravo", purchases: [] };
    const animals = [
      dam("dam-1", {
        breedings: [{ ...breeding("c1", "2026-01-01", "NEL-4471"), semenBullId: "sb-1" }],
      }),
    ];

    const [row] = recentBreedings(animals, [other, tufao]);

    expect(row.semenBull).toBe(tufao);
    expect(row.bull).toBeNull();
  });

  it("keeps the herd bull and no semen bull for a natural mating", () => {
    const animals = [
      dam("dam-1", { breedings: [breeding("c1", "2026-01-01", "T-10")] }),
      bull("T-10"),
    ];

    const [row] = recentBreedings(animals, [{ id: "sb-1", name: "T-10", purchases: [] }]);

    expect(row.bull?.id).toBe("bull-T-10");
    expect(row.semenBull).toBeNull();
  });

  it("has no semen bull when its id no longer resolves", () => {
    const animals = [
      dam("dam-1", {
        breedings: [{ ...breeding("c1", "2026-01-01", "NEL-4471"), semenBullId: "sb-gone" }],
      }),
    ];

    expect(recentBreedings(animals, [])[0].semenBull).toBeNull();
  });

  it("keeps the breedings of a dam that has since left the herd", () => {
    const animals = [
      dam("dam-1", { breedings: [breeding("c1", "2026-01-01")] }, {
        active: false,
        inactiveReason: "sale",
      }),
    ];

    expect(recentBreedings(animals, [])).toHaveLength(1);
  });

  it("ignores animals with no reproduction record or no breedings", () => {
    expect(recentBreedings([makeAnimal(), dam("dam-1", {})], [])).toEqual([]);
  });
});

describe("filterBreedings", () => {
  const rows = recentBreedings([
    makeAnimal({
      id: "dam-1",
      earTag: "DAM-1",
      category: "cow",
      sex: "female",
      reproduction: {
        breedings: [
          { id: "pending", date: "2026-05-01", type: "timedAI", bullEarTag: "T-10" },
          { id: "pregnant", date: "2026-01-01", type: "timedAI", bullEarTag: "T-10" },
          { id: "open", date: "2025-10-01", type: "naturalMating", bullEarTag: "T-11" },
        ],
        diagnoses: [
          { breedingId: "pregnant", result: "pregnant", date: "2026-02-05" },
          { breedingId: "open", result: "open", date: "2025-11-05" },
        ],
        calvings: [],
      },
    }),
  ], []);

  it("keeps everything for 'all'", () => {
    expect(filterBreedings(rows, "all").map((row) => row.key)).toEqual([
      "pending",
      "pregnant",
      "open",
    ]);
  });

  it.each(["pending", "pregnant", "open"] as const)(
    "keeps only the rows whose outcome is %s",
    (filter) => {
      expect(filterBreedings(rows, filter).map((row) => row.key)).toEqual([filter]);
    }
  );
});

describe("lotSummary", () => {
  const today = "2026-09-10";
  const summaryInvernadas: Invernada[] = [
    { id: "inv-a", code: "03", name: "Fundo", grass: "Braquiária", hectares: 30 },
    { id: "inv-b", code: "01", name: "Baixada", grass: "Mombaça", hectares: 10 },
  ];
  const summaryLots: Lot[] = [
    { id: "lot-a", name: "Recria 2025" },
    { id: "lot-b", name: "Matrizes" },
    { id: "lot-gone", name: "Antigo", deletedAt: "2026-08-01T00:00:00.000Z" },
    { id: "lot-closed", name: "Engorda 2024" },
  ];
  const summaryPlacements: LotPlacement[] = [
    {
      id: "p-a-old",
      lotId: "lot-a",
      invernadaId: "inv-b",
      startedOn: "2026-02-02",
      endedOn: "2026-06-12",
    },
    { id: "p-a-now", lotId: "lot-a", invernadaId: "inv-a", startedOn: "2026-06-12" },
    { id: "p-b-now", lotId: "lot-b", invernadaId: "inv-a", startedOn: "2026-01-01" },
    {
      id: "p-closed",
      lotId: "lot-closed",
      invernadaId: "inv-b",
      startedOn: "2025-09-01",
      endedOn: "2026-07-22",
    },
  ];
  const summaryAnimals = [
    makeAnimal({
      id: "a1",
      earTag: "0417",
      lotId: "lot-a",
      category: "heifer",
      sex: "female",
      birthDate: "2024-11-12",
      weighings: [
        { date: "2026-05-15", weightKg: 300 },
        { date: "2026-08-28", weightKg: 360 },
      ],
    }),
    makeAnimal({
      id: "a2",
      earTag: "0418",
      lotId: "lot-a",
      category: "heifer",
      sex: "female",
      birthDate: "2025-02-20",
      weighings: [{ date: "2026-08-28", weightKg: 300 }],
    }),
    makeAnimal({
      id: "a3",
      earTag: "0433",
      lotId: "lot-a",
      category: "calf",
      birthDate: "2026-02-14",
      weighings: [],
    }),
    makeAnimal({
      id: "a4",
      earTag: "0999",
      lotId: "lot-a",
      active: false,
      weighings: [{ date: "2026-08-28", weightKg: 500 }],
    }),
    makeAnimal({
      id: "b1",
      earTag: "0100",
      lotId: "lot-b",
      category: "cow",
      sex: "female",
      birthDate: "2020-01-01",
      weighings: [{ date: "2026-08-01", weightKg: 450 }],
    }),
  ];
  const summaryTreatments: Treatment[] = [
    makeTreatment({ id: "t1", animalEarTag: "0417", type: "deworming", name: "Vermífugo", date: "2026-09-15" }),
    makeTreatment({ id: "t2", animalEarTag: "0418", type: "deworming", name: "Vermífugo", date: "2026-09-15" }),
    makeTreatment({ id: "t3", animalEarTag: "0433", type: "vaccine", name: "Aftosa", date: "2026-09-30" }),
    makeTreatment({ id: "t4", animalEarTag: "0417", type: "vaccine", name: "Clostridiose", date: "2026-09-01" }),
    makeTreatment({ id: "t5", animalEarTag: "0100", type: "deworming", name: "Vermífugo", date: "2026-09-12" }),
    makeTreatment({ id: "t6", animalEarTag: "0418", type: "exam", name: "Brucelose", date: "2026-09-11", status: "done" }),
  ];
  const state = {
    lots: summaryLots,
    animals: summaryAnimals,
    treatments: [] as Treatment[],
    invernadas: summaryInvernadas,
    lotPlacements: summaryPlacements,
  };

  it("is null for an unknown or a deleted lot", () => {
    expect(lotSummary("nope", state, today)).toBeNull();
    expect(lotSummary("lot-gone", state, today)).toBeNull();
  });

  it("counts only the active animals of the lot, by category, with weight and AU", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.lot.name).toBe("Recria 2025");
    expect(summary.animals.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(summary.heads).toBe(3);
    expect(summary.byCategory).toEqual({ calf: 1, heifer: 2, steer: 0, cow: 0, bull: 0 });
    expect(summary.weighedHeads).toBe(2);
    expect(summary.totalWeightKg).toBe(660);
    expect(summary.totalArrobas).toBe(22);
    expect(summary.totalAu).toBeCloseTo(660 / 450, 6);
    expect(summary.lastWeighingDate).toBe("2026-08-28");
  });

  it("averages weight over the weighed heads and age over every head", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.avgWeightKg).toBe(330);
    expect(summary.avgLiveArrobas).toBe(11);
    // 21 + 18 + 6 complete months, floored mean.
    expect(summary.avgAgeMonths).toBe(15);
  });

  it("has null averages without weighings and null age without animals", () => {
    const summary = lotSummary("lot-closed", state, today)!;
    expect(summary.heads).toBe(0);
    expect(summary.avgWeightKg).toBeNull();
    expect(summary.avgLiveArrobas).toBeNull();
    expect(summary.avgAgeMonths).toBeNull();
    expect(summary.lastWeighingDate).toBeNull();
  });

  it("reports the 120-day ADG and how many animals it covers", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.adg).toBeCloseTo(60 / 105, 6);
    expect(summary.adgHeads).toBe(1);
  });

  it("resolves the current invernada, the days there and the whole-invernada stocking", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.currentPlacement?.id).toBe("p-a-now");
    expect(summary.currentInvernada?.code).toBe("03");
    expect(summary.daysInInvernada).toBe(90);
    // Lote a (660 kg) and lote b (450 kg) share the 30 ha.
    expect(summary.stocking?.auPerHa).toBeCloseTo(1110 / 450 / 30, 6);
    expect(summary.stocking?.classification).toBe("light");
    expect(summary.stocking?.otherLots.map((lot) => lot.id)).toEqual(["lot-b"]);
  });

  it("lists every placement newest first with the days spent", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.placements.map((row) => row.placement.id)).toEqual(["p-a-now", "p-a-old"]);
    expect(summary.placements[0].days).toBe(90);
    expect(summary.placements[0].invernada?.code).toBe("03");
    expect(summary.placements[1].days).toBe(130);
    expect(summary.placements[1].invernada?.code).toBe("01");
  });

  it("has no invernada, no stocking and no days for a closed lot", () => {
    const summary = lotSummary("lot-closed", state, today)!;
    expect(summary.currentPlacement).toBeNull();
    expect(summary.currentInvernada).toBeNull();
    expect(summary.daysInInvernada).toBeNull();
    expect(summary.stocking).toBeNull();
    expect(summary.placements.map((row) => row.placement.id)).toEqual(["p-closed"]);
  });

  it("counts every head as healthy without treatments and has no next activity", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.health).toEqual({ healthy: 3, attention: 0, overdue: 0 });
    expect(summary.nextActivity).toBeNull();
  });

  it("counts health by derived status and picks the earliest scheduled activity of the lot", () => {
    const summary = lotSummary("lot-a", { ...state, treatments: summaryTreatments }, today)!;
    // 0417 has an overdue vaccine; 0418 and 0433 have a treatment within 30 days.
    expect(summary.health).toEqual({ healthy: 0, attention: 2, overdue: 1 });
    // The overdue one and the other lot's 12/09 deworming are ignored; two heads share 15/09.
    expect(summary.nextActivity).toEqual({
      date: "2026-09-15",
      type: "deworming",
      name: "Vermífugo",
      heads: 2,
    });
  });
});

describe("animalsByBreed", () => {
  const today = "2026-09-12";
  const derived = (animals: Animal[]) => withStatus(animals, [], today);
  const weighedAt = (weightKg: number) => [{ date: "2026-08-28", weightKg }];

  it("returns no groups for a lote with no animals", () => {
    expect(animalsByBreed([])).toEqual([]);
  });

  it("puts the raça with the most heads first, then orders by name", () => {
    const groups = animalsByBreed(
      derived([
        makeAnimal({ id: "a1", earTag: "01", breed: "Tabapuã" }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Nelore" }),
        makeAnimal({ id: "a3", earTag: "03", breed: "Guzerá" }),
        makeAnimal({ id: "a4", earTag: "04", breed: "Nelore" }),
        makeAnimal({ id: "a5", earTag: "05", breed: "Angus" }),
      ])
    );

    expect(groups.map((group) => [group.breed, group.heads])).toEqual([
      ["Nelore", 2],
      ["Angus", 1],
      ["Guzerá", 1],
      ["Tabapuã", 1],
    ]);
  });

  it("keeps each raça's animals in the order they came in", () => {
    const [nelore] = animalsByBreed(
      derived([
        makeAnimal({ id: "a3", earTag: "03", breed: "Nelore" }),
        makeAnimal({ id: "a1", earTag: "01", breed: "Nelore" }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Nelore" }),
      ])
    );

    expect(nelore.items.map((item) => item.animal.id)).toEqual(["a3", "a1", "a2"]);
  });

  it("averages the weight over the weighed animals only", () => {
    const [nelore] = animalsByBreed(
      derived([
        makeAnimal({ id: "a1", earTag: "01", breed: "Nelore", weighings: weighedAt(300) }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Nelore", weighings: weighedAt(360) }),
        makeAnimal({ id: "a3", earTag: "03", breed: "Nelore", weighings: [] }),
      ])
    );

    expect(nelore).toMatchObject({ heads: 3, weighedHeads: 2, avgWeightKg: 330 });
  });

  it("uses the newest weighing of each animal", () => {
    const [nelore] = animalsByBreed(
      derived([
        makeAnimal({
          id: "a1",
          earTag: "01",
          breed: "Nelore",
          weighings: [
            { date: "2026-05-15", weightKg: 280 },
            { date: "2026-08-28", weightKg: 340 },
          ],
        }),
      ])
    );

    expect(nelore.avgWeightKg).toBe(340);
  });

  it("has no average when nobody in the raça was weighed", () => {
    const [senepol] = animalsByBreed(
      derived([
        makeAnimal({ id: "a1", earTag: "01", breed: "Senepol" }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Senepol" }),
      ])
    );

    expect(senepol).toMatchObject({ heads: 2, weighedHeads: 0, avgWeightKg: null });
  });
});

describe("lotsByInvernada", () => {
  const state = {
    lots,
    animals,
    treatments: [] as Treatment[],
    invernadas,
    lotPlacements: placements,
    manejoSessions: [] as ManejoSession[],
  };

  it("groups the placed lots under their invernada, ordered by code", () => {
    const { sections } = lotsByInvernada(state, "2026-09-11");

    expect(sections.map((section) => section.invernada.code)).toEqual(["01"]);
    expect(sections[0].lots.map((row) => row.lot.name)).toEqual(["Matrizes", "Recria"]);
    expect(sections[0].headCount).toBe(2);
    expect(sections[0].totalWeightKg).toBe(1350);
    expect(sections[0].totalAu).toBeCloseTo(3);
    expect(sections[0].auPerHa).toBeCloseTo(0.3);
    expect(sections[0].classification).toBe("light");
  });

  it("agrees with invernadasWithSummary on the stocking rate", () => {
    const { sections } = lotsByInvernada(state, "2026-09-11");
    const occupancy = invernadasWithSummary(invernadas, lots, placements, animals).find(
      (item) => item.invernada.id === "invernada-1"
    );

    expect(sections[0].auPerHa).toBe(occupancy?.auPerHa);
  });

  it("carries per-lot weight, arrobas and health onto the card row", () => {
    const { sections } = lotsByInvernada(state, "2026-09-11");
    const [matrizes] = sections[0].lots;

    expect(matrizes).toMatchObject({
      heads: 1,
      totalWeightKg: 450,
      health: { healthy: 1, attention: 0, overdue: 0 },
      canDelete: false,
    });
    expect(matrizes.totalArrobas).toBeCloseTo(15);
    expect(matrizes.adg).toBeNull();
    expect(matrizes.placement?.id).toBe("placement-current-1");
  });

  it("lists the invernadas with no lot, with the days since the last one left", () => {
    const { free } = lotsByInvernada(state, "2026-09-11");

    expect(free.map((item) => item.invernada.code)).toEqual(["02", "03"]);
    expect(free[0].freeForDays).toBe(72);
    expect(free[1].freeForDays).toBeNull();
  });

  it("puts a lot with no open placement under closed, newest first", () => {
    const closedLot: Lot = { id: "lot-3", name: "Bezerros 2024" };
    const closedPlacement: LotPlacement = {
      id: "placement-closed",
      lotId: "lot-3",
      invernadaId: "invernada-3",
      startedOn: "2026-01-05",
      endedOn: "2026-02-28",
    };
    const { closed, sections } = lotsByInvernada(
      { ...state, lots: [...lots, closedLot], lotPlacements: [...placements, closedPlacement] },
      "2026-09-11"
    );

    expect(closed.map((row) => row.lot.name)).toEqual(["Bezerros 2024"]);
    expect(closed[0].closedOn).toBe("2026-02-28");
    expect(closed[0].lastInvernada?.code).toBe("03");
    expect(closed[0].canDelete).toBe(true);
    expect(sections.map((section) => section.invernada.code)).toEqual(["01"]);
  });

  it("leaves a deleted lot out of every group", () => {
    const deleted: Lot = { id: "lot-9", name: "Apagado", deletedAt: "2026-08-01T12:00:00.000Z" };
    const { sections, closed } = lotsByInvernada(
      { ...state, lots: [...lots, deleted] },
      "2026-09-11"
    );

    expect(sections.flatMap((section) => section.lots).map((row) => row.lot.id)).not.toContain(
      "lot-9"
    );
    expect(closed.map((row) => row.lot.id)).not.toContain("lot-9");
  });

  it("totals the placed lots and the whole-herd stocking rate", () => {
    const { totals } = lotsByInvernada(state, "2026-09-11");

    expect(totals).toMatchObject({
      activeLots: 2,
      occupiedInvernadas: 1,
      heads: 2,
      weighedHeads: 2,
      herdClassification: "light",
    });
    expect(totals.totalAu).toBeCloseTo(3);
    expect(totals.herdAuPerHa).toBeCloseTo(0.05);
  });
});

describe("treatmentBatchSize", () => {
  it("counts every treatment scheduled by the same calendar action", () => {
    const treatments: Treatment[] = [
      makeTreatment({ id: "t-1", batchId: "batch-1", animalEarTag: "BR-001" }),
      makeTreatment({ id: "t-2", batchId: "batch-1", animalEarTag: "BR-002" }),
      makeTreatment({ id: "t-3", batchId: "batch-2", animalEarTag: "BR-003" }),
    ];

    expect(treatmentBatchSize(treatments, treatments[0])).toBe(2);
  });

  it("falls back to the same treatment, day and status when there is no batch", () => {
    const target = makeTreatment({ id: "t-9", animalEarTag: "BR-001" });
    const treatments: Treatment[] = [
      target,
      makeTreatment({ id: "t-10", animalEarTag: "BR-002" }),
      makeTreatment({ id: "t-11", animalEarTag: "BR-003", date: "2026-08-02" }),
      makeTreatment({ id: "t-12", animalEarTag: "BR-004", name: "Vermifugação" }),
      makeTreatment({ id: "t-13", animalEarTag: "BR-005", status: "done" }),
    ];

    expect(treatmentBatchSize(treatments, target)).toBe(2);
  });

  it("keeps a batched treatment out of the fallback group", () => {
    const target = makeTreatment({ id: "t-9" });
    const treatments: Treatment[] = [
      target,
      makeTreatment({ id: "t-10", batchId: "batch-1" }),
    ];

    expect(treatmentBatchSize(treatments, target)).toBe(1);
  });
});
