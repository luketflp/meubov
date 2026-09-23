import { describe, expect, it } from "vitest";
import { birthsExportTable } from "@/lib/export/datasets/births";
import { recentBirths } from "@/lib/store/selectors";
import { DEFAULT_BIRTH_SORT, sortBirths } from "@/components/births/sort-births";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";

const dam = makeAnimal({
  id: "d1",
  earTag: "0412",
  category: "cow",
  sex: "female",
  lotId: "l1",
  reproduction: {
    breedings: [],
    diagnoses: [],
    calvings: [
      { date: "2026-08-10", calfEarTag: "1001" },
      { date: "2026-09-01", calfEarTag: "1002" },
    ],
  },
});
const calf = makeAnimal({
  id: "c1",
  earTag: "1001",
  category: "calf",
  sex: "female",
  breed: "Nelore",
  birthDate: "2026-08-10",
  weighings: [{ date: "2026-08-10", weightKg: 32 }],
});

describe("birthsExportTable", () => {
  it("writes the table's rows in the screen's sort, with the dam's lote", () => {
    const lotNames = new Map([["l1", "Maternidade"]]);
    const births = sortBirths(recentBirths([dam, calf]), DEFAULT_BIRTH_SORT, lotNames);
    const table = birthsExportTable(births, lotNames);
    expect(table.title).toBe("Nascimentos");
    expect(table.columns.map((c) => c.header)).toEqual([
      "Data",
      "Bezerro",
      "Sexo",
      "Mãe",
      "Lote da mãe",
      "Raça",
      "Peso ao nascer (kg)",
    ]);
    expect(table.rows).toEqual([
      ["2026-09-01", "1002", null, "0412", "Maternidade", null, null],
      ["2026-08-10", "1001", "Fêmea", "0412", "Maternidade", "Nelore", 32],
    ]);
  });
});
