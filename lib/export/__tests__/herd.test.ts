import { describe, expect, it } from "vitest";
import { herdExportTable } from "@/lib/export/datasets/herd";
import type { AnimalWithDerived } from "@/lib/store/selectors";

const item: AnimalWithDerived = {
  animal: {
    id: "a1",
    earTag: "0412",
    category: "cow",
    breed: "Nelore",
    sex: "female",
    birthDate: "2019-03-12",
    lotId: "l1",
    active: true,
    weighings: [
      { date: "2026-05-02", weightKg: 440 },
      { date: "2026-09-02", weightKg: 472 },
    ],
  },
  status: "healthy",
  reason: null,
  currentWeightKg: 472,
  arrobas: 15.7,
  adg: 0.262,
};

describe("herdExportTable", () => {
  it("writes one row per animal with lot, invernada and the last weighing", () => {
    const table = herdExportTable(
      [item],
      {
        lotNames: new Map([["l1", "Matrizes com cria"]]),
        invernadaNames: new Map([["l1", "01 · Baixada"]]),
        customCategories: [],
      },
      "2026-09-22"
    );
    expect(table.title).toBe("Rebanho");
    expect(table.rows).toEqual([
      ["0412", "Vaca", "Nelore", "Fêmea", "2019-03-12", 90, 472, "2026-09-02", 0.262, "Matrizes com cria", "01 · Baixada", "Saudável", null],
    ]);
  });
});
