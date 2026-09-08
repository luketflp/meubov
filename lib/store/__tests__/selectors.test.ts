import { describe, expect, it } from "vitest";
import type {
  Animal,
  Calving,
  Invernada,
  Lot,
  LotPlacement,
  ManejoSession,
} from "@/lib/types";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";
import {
  animalById,
  canDeleteLot,
  currentlyPlacedLots,
  herdStockingRateAuPerHa,
  invernadasWithSummary,
  lotsWithSummary,
  recentBirths,
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
