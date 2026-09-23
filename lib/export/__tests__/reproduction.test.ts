import { describe, expect, it } from "vitest";
import { breedingsExportTable, ultrasoundExportTable } from "@/lib/export/datasets/reproduction";
import { breedingsByLot, filterBreedings, recentBreedings } from "@/lib/store/selectors";
import type { UltrasoundGroup } from "@/lib/domain/ultrasound";
import { makeAnimal, makeSemenBull } from "@/lib/domain/__tests__/fixtures";

const tufao = makeSemenBull({ id: "sb-1", name: "Tufão da Serra" });
const dam1 = makeAnimal({
  id: "d1",
  earTag: "0412",
  category: "cow",
  sex: "female",
  lotId: "l1",
  reproduction: {
    breedings: [{ id: "b1", date: "2026-01-10", type: "timedAI", bullEarTag: "NEL-4471", semenBullId: "sb-1" }],
    diagnoses: [{ breedingId: "b1", result: "pregnant", date: "2026-02-20", notes: "gestação de ~40 dias" }],
    calvings: [],
  },
});
const dam2 = makeAnimal({
  id: "d2",
  earTag: "0500",
  category: "cow",
  sex: "female",
  lotId: "gone",
  reproduction: {
    breedings: [{ id: "b2", date: "2026-03-01", type: "naturalMating", bullEarTag: "T-10" }],
    diagnoses: [],
    calvings: [],
  },
});

describe("breedingsExportTable", () => {
  it("writes the screen's rows with lote, bull name, diagnosis and forecast", () => {
    const rows = recentBreedings([dam1, dam2], [tufao]);
    const table = breedingsExportTable(rows, new Map([["l1", "Matrizes"]]));
    expect(table.title).toBe("Coberturas");
    expect(table.columns.map((c) => c.header)).toEqual([
      "Data",
      "Matriz",
      "Lote",
      "Tipo",
      "Touro",
      "Diagnóstico",
      "Data do diagnóstico",
      "Previsão de parto",
      "Observação",
    ]);
    expect(table.rows).toEqual([
      ["2026-03-01", "0500", null, "Monta natural", "T-10", "Pendente", null, null, null],
      ["2026-01-10", "0412", "Matrizes", "IATF", "Tufão da Serra", "Prenhe", "2026-02-20", rows[1].outcome.expectedCalvingDate, "gestação de ~40 dias"],
    ]);
    expect(rows[1].outcome.expectedCalvingDate).not.toBeNull();
  });

  it("keeps the order it is given, e.g. the lote groups of the filtered list", () => {
    const rows = filterBreedings(recentBreedings([dam1, dam2], [tufao]), "pregnant");
    const ordered = breedingsByLot(rows, [{ id: "l1", name: "Matrizes" } as never]).flatMap((g) => g.rows);
    expect(breedingsExportTable(ordered, new Map()).rows.map((r) => r[1])).toEqual(["0412"]);
  });
});

describe("ultrasoundExportTable", () => {
  it("flattens the groups with the lote of each cow", () => {
    const groups: UltrasoundGroup[] = [
      {
        key: "l1",
        lotId: "l1",
        name: "Matrizes",
        rows: [{ dam: dam1, breeding: dam1.reproduction!.breedings[0], bull: tufao, result: "pending", days: 40 }],
        pending: 1,
        pregnant: 0,
        open: 0,
      },
      {
        key: "sem-lote",
        lotId: null,
        name: null,
        rows: [{ dam: dam2, breeding: dam2.reproduction!.breedings[0], bull: null, result: "open", notes: "cisto", days: 12 }],
        pending: 0,
        pregnant: 0,
        open: 1,
      },
    ];
    expect(ultrasoundExportTable(groups).rows).toEqual([
      ["Matrizes", "0412", "2026-01-10", "Tufão da Serra", "IATF", 40, "Pendente", null],
      ["Sem lote", "0500", "2026-03-01", "T-10", "Monta natural", 12, "Vazia", "cisto"],
    ]);
  });
});
