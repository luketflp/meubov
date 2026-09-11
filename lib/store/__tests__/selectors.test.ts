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
  Treatment,
} from "@/lib/types";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import {
  animalById,
  canDeleteLot,
  currentlyPlacedLots,
  filterBreedings,
  herdStockingRateAuPerHa,
  invernadasWithSummary,
  lotSummary,
  lotsWithSummary,
  recentBirths,
  recentBreedings,
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

    expect(recentBreedings(animals).map((row) => row.key)).toEqual([
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

    const [row] = recentBreedings(animals);

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

    const [row] = recentBreedings(animals);

    expect(row.breeding.bullEarTag).toBe("SEMEN-4521");
    expect(row.bull).toBeNull();
  });

  it("keeps the breedings of a dam that has since left the herd", () => {
    const animals = [
      dam("dam-1", { breedings: [breeding("c1", "2026-01-01")] }, {
        active: false,
        inactiveReason: "sale",
      }),
    ];

    expect(recentBreedings(animals)).toHaveLength(1);
  });

  it("ignores animals with no reproduction record or no breedings", () => {
    expect(recentBreedings([makeAnimal(), dam("dam-1", {})])).toEqual([]);
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
  ]);

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
