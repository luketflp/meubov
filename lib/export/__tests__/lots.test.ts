import { describe, expect, it } from "vitest";
import { currentInvernadaNames, lotsExportTable, weighingsExportTable } from "@/lib/export/datasets/lots";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";
import { lotsByInvernada } from "@/lib/store/selectors";
import type { Invernada, Lot, LotPlacement } from "@/lib/types";

const invernadas: Invernada[] = [
  { id: "i1", code: "01", name: "Baixada", grass: "Braquiária", hectares: 10 },
  { id: "i2", code: "02", grass: "Mombaça", hectares: 5 },
];
const lots: Lot[] = [
  { id: "l1", name: "Matrizes" },
  { id: "l2", name: "Recria" },
];
const lotPlacements: LotPlacement[] = [
  { id: "p1", lotId: "l1", invernadaId: "i1", startedOn: "2026-07-01" },
  { id: "p2", lotId: "l2", invernadaId: "i2", startedOn: "2026-01-01", endedOn: "2026-06-01" },
];
const animals = [
  makeAnimal({ id: "a1", earTag: "01", lotId: "l1", weighings: [{ date: "2026-09-01", weightKg: 450 }] }),
  makeAnimal({ id: "a2", earTag: "02", lotId: "l1", weighings: [{ date: "2026-09-01", weightKg: 450 }] }),
];

describe("currentInvernadaNames", () => {
  it("names the open placement's invernada of each lot", () => {
    expect(currentInvernadaNames(invernadas, lotPlacements)).toEqual(new Map([["l1", "01 · Baixada"]]));
  });
});

describe("lotsExportTable", () => {
  it("writes the lots by invernada, then the free invernadas and the closed lots", () => {
    const view = lotsByInvernada(
      { lots, animals, treatments: [], invernadas, lotPlacements, manejoSessions: [] },
      "2026-09-22"
    );
    const table = lotsExportTable(view);
    expect(table.columns.map((c) => c.header)).toEqual([
      "Invernada (código)",
      "Invernada (nome)",
      "Área (ha)",
      "Lote",
      "Cabeças",
      "UA/ha",
      "Desde",
    ]);
    expect(table.rows).toEqual([
      ["01", "Baixada", 10, "Matrizes", 2, 0.2, "2026-07-01"],
      ["02", null, 5, null, 0, 0, null],
      [null, null, null, "Recria", 0, null, null],
    ]);
  });
});

describe("weighingsExportTable", () => {
  it("writes every weighing with the current lot and the gain since the previous one", () => {
    const animal = makeAnimal({
      earTag: "0412",
      lotId: "l1",
      weighings: [
        { date: "2026-05-01", weightKg: 400 },
        { date: "2026-05-11", weightKg: 410 },
      ],
    });
    expect(weighingsExportTable([animal], new Map([["l1", "Matrizes"]])).rows).toEqual([
      ["0412", "2026-05-01", 400, "Matrizes", null],
      ["0412", "2026-05-11", 410, "Matrizes", 1],
    ]);
  });
});
