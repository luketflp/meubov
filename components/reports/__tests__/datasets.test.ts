import { describe, expect, it } from "vitest";
import { datasetRows, reportDatasets } from "@/components/reports/datasets";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import { makeData } from "@/lib/reports/__tests__/data";

const TODAY = "2026-09-22";

const data = makeData({
  animals: [
    makeAnimal({ earTag: "B", weighings: [{ date: "2026-01-01", weightKg: 300 }] }),
    makeAnimal({ earTag: "A" }),
    makeAnimal({ earTag: "C", active: false, inactiveDate: "2026-05-01", inactiveReason: "death" }),
  ],
  treatments: [makeTreatment({ animalEarTag: "A", costBrl: 12 })],
  expenses: [{ id: "e1", kind: "expense", date: "2026-02-01", category: "nutrition", amountBrl: 500 }],
});

describe("reportDatasets", () => {
  it("lists the planilhas in order, Despesas last with Financeiro view", () => {
    const names = reportDatasets(data, TODAY, true).map((d) => d.name);
    expect(names).toEqual([
      "Animais",
      "Pesagens",
      "Tratamentos",
      "Coberturas e diagnósticos",
      "Nascimentos",
      "Baixas",
      "Manejos",
      "Lotes e invernadas",
      "Touros e sêmen",
      "Despesas",
    ]);
  });

  it("takes the active herd in brinco order and every baixa", () => {
    const datasets = reportDatasets(data, TODAY, true);
    const animals = datasets.find((d) => d.key === "animals")!;
    expect(animals.tables[0].rows.map((row) => row[0])).toEqual(["A", "B"]);
    expect(datasetRows(datasets.find((d) => d.key === "baixas")!)).toBe(1);
    expect(datasetRows(datasets.find((d) => d.key === "weighings")!)).toBe(1);
  });

  it("leaves out Despesas and money columns without Financeiro view", () => {
    const datasets = reportDatasets(data, TODAY, false);
    expect(datasets.some((d) => d.key === "expenses")).toBe(false);
    for (const dataset of datasets) {
      for (const table of dataset.tables) expect(table.columns.some((c) => c.kind === "money")).toBe(false);
    }
  });

  it("offers Touros e sêmen as xlsx only, with two tables", () => {
    const semen = reportDatasets(data, TODAY, true).find((d) => d.key === "semen")!;
    expect(semen.csv).toBe(false);
    expect(semen.tables).toHaveLength(2);
  });
});
