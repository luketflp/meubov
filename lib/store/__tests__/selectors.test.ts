import { describe, expect, it } from "vitest";
import type { Invernada, Lot, LotPlacement } from "@/lib/types";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";
import {
  animalById,
  currentlyPlacedLots,
  herdStockingRateAuPerHa,
  invernadasWithSummary,
  lotsWithSummary,
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
