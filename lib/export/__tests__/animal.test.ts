import { describe, expect, it } from "vitest";
import { animalExportTables, animalWeighingsTable, weighingGains } from "@/lib/export/datasets/animal";
import { makeAnimal, makeSemenBull, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import type { AnimalWithDerived } from "@/lib/store/selectors";

const cow = makeAnimal({
  id: "a1",
  earTag: "0412",
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2019-03-12",
  weighings: [
    { date: "2026-05-02", weightKg: 440 },
    { date: "2026-06-01", weightKg: 455 },
    { date: "2026-06-01", weightKg: 456 },
  ],
  reproduction: {
    breedings: [
      { id: "b1", date: "2025-11-10", type: "timedAI", bullEarTag: "NEL-4471", semenBullId: "bull-1" },
      { id: "b2", date: "2024-11-10", type: "naturalMating", bullEarTag: "T-09" },
    ],
    diagnoses: [{ breedingId: "b1", result: "pregnant", date: "2026-01-10", notes: "~60 dias" }],
    calvings: [{ date: "2025-08-20", calfEarTag: "0912" }],
  },
});

const item: AnimalWithDerived = {
  animal: cow,
  status: "healthy",
  reason: null,
  currentWeightKg: 456,
  arrobas: 15.2,
  adg: 0.533,
};

const names = {
  lotName: "Matrizes",
  invernadaName: "01 · Baixada",
  customCategories: [],
  semenBulls: [makeSemenBull()],
};

describe("weighingGains", () => {
  it("gives the GMD since the previous weighing, null for the first and a same-day one", () => {
    expect(weighingGains(cow.weighings)).toEqual([null, 0.5, null]);
  });
});

describe("animalWeighingsTable", () => {
  it("writes date, weight and gain oldest first", () => {
    expect(animalWeighingsTable(cow).rows).toEqual([
      ["2026-05-02", 440, null],
      ["2026-06-01", 455, 0.5],
      ["2026-06-01", 456, null],
    ]);
  });
});

describe("animalExportTables", () => {
  const treatments = [
    makeTreatment({ id: "t1", animalEarTag: "0412", date: "2026-03-01", status: "done", withdrawalDays: 30, costBrl: 4.5 }),
    makeTreatment({ id: "t2", animalEarTag: "0412", date: "2026-10-01", type: "deworming", name: "Ivermectina", dose: "5 ml" }),
  ];
  const tables = animalExportTables(item, treatments, names, "2026-09-22");

  it("gives Dados, Pesagens, Sanidade and Reprodução for a female", () => {
    expect(tables.map((t) => t.title)).toEqual(["Dados", "Pesagens", "Sanidade", "Reprodução"]);
  });

  it("lays the fields out as Campo/Valor", () => {
    const dados = tables[0];
    expect(dados.columns.map((c) => c.header)).toEqual(["Campo", "Valor"]);
    const field = (name: string) => dados.rows.find((row) => row[0] === name)?.[1];
    expect(field("Brinco")).toBe("0412");
    expect(field("Categoria")).toBe("Vaca");
    expect(field("Nascimento")).toBe("12/03/2019");
    expect(field("Lote")).toBe("Matrizes");
    expect(field("Situação")).toBe("No rebanho");
    expect(field("Diagnóstico atual")).toBe("Prenhe");
    expect(field("Previsão de parto")).toBe("20/08/2026");
  });

  it("lists the treatments newest first with the end of the withdrawal", () => {
    expect(tables[2].rows).toEqual([
      ["2026-10-01", "Vermifugação", "Ivermectina", "5 ml", "Agendado", 0, null, null, null, null],
      ["2026-03-01", "Vacina", "Vacina aftosa", null, "Feito", 30, "2026-03-31", null, 4.5, null],
    ]);
  });

  it("lists coberturas with their diagnosis and partos, newest first", () => {
    expect(tables[3].rows).toEqual([
      ["2025-11-10", "Cobertura", "IATF", "Tufão da Serra", "Prenhe", "2026-01-10", "2026-08-20", null, "~60 dias"],
      ["2025-08-20", "Parto", null, null, null, null, null, "0912", null],
      ["2024-11-10", "Cobertura", "Monta natural", "T-09", "Pendente", null, null, null, null],
    ]);
  });

  it("leaves Reprodução out for a male", () => {
    const steer = { ...item, animal: makeAnimal() };
    expect(animalExportTables(steer, [], names, "2026-09-22").map((t) => t.title)).toEqual([
      "Dados",
      "Pesagens",
      "Sanidade",
    ]);
  });
});
