import { describe, expect, it } from "vitest";
import { baixasExportTable } from "@/lib/export/datasets/baixas";
import { recentBaixas } from "@/components/baixas/baixas";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";

const animals = [
  makeAnimal({
    id: "a1",
    earTag: "0101",
    category: "cow",
    breed: "Nelore",
    active: false,
    inactiveReason: "death",
    inactiveDate: "2026-09-10",
    inactiveNotes: "picada de cobra",
  }),
  makeAnimal({ id: "a2", earTag: "0102", active: false, inactiveReason: "other", inactiveDate: "2026-09-12" }),
  makeAnimal({ id: "a3", earTag: "0103", active: false, inactiveReason: "sale", inactiveDate: "2026-09-15" }),
  makeAnimal({ id: "a4", earTag: "0104", customCategoryId: "cc1", active: false, inactiveReason: "loss" }),
];
const names = {
  lotNames: new Map([["lot-1", "Recria"]]),
  customCategories: [{ id: "cc1", name: "Garrote", baseCategory: "steer" as const }],
};

describe("baixasExportTable", () => {
  it("writes the recentBaixas rows under the filter, newest first", () => {
    const table = baixasExportTable(recentBaixas(animals, "mortes"), names);
    expect(table.columns.map((c) => c.header)).toEqual([
      "Data",
      "Brinco",
      "Categoria",
      "Raça",
      "Lote",
      "Motivo",
      "Observação",
    ]);
    expect(table.rows).toEqual([
      ["2026-09-10", "0101", "Vaca", "Nelore", "Recria", "Morte", "picada de cobra"],
      [null, "0104", "Garrote", "Angus", "Recria", "Perda / extravio", null],
    ]);
  });

  it("leaves the sales out of every motivo", () => {
    const table = baixasExportTable(recentBaixas(animals, "todas"), names);
    expect(table.rows.map((row) => row[1])).toEqual(["0102", "0101", "0104"]);
  });
});
