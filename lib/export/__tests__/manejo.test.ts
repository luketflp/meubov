import { describe, expect, it } from "vitest";
import {
  manejoExportTable,
  manejoHistoryExportTable,
  saleLinesExportTable,
  weighingLinesExportTable,
} from "@/lib/export/datasets/manejo";
import { manejoHistory } from "@/components/manejo/helpers";
import { saleRows } from "@/lib/domain/movements";
import { sessionWeighingLines } from "@/lib/domain/manejoDetail";
import { makeAnimal, makeManejoSession, makeTreatment } from "@/lib/domain/__tests__/fixtures";

const lots = [
  { id: "lot-1", name: "Recria" },
  { id: "lot-2", name: "Engorda" },
];

const sale = makeManejoSession({
  id: "s-sale",
  name: "Venda frigorífico",
  date: "2026-09-10",
  status: "closed",
  kind: "sale",
  counterparty: "Frigorífico Boi Bom",
  pricePerArroba: 300,
  carcassYieldPct: 50,
  animals: [
    { earTag: "BR-001", outcome: "done", weightKg: 540, amountBrl: 5400 },
    { earTag: "BR-002", outcome: "skipped", notes: "manco" },
  ],
});
const transfer = makeManejoSession({
  id: "s-transfer",
  name: "Troca para engorda",
  date: "2026-09-12",
  status: "open",
  kind: "transfer",
  destinationLotId: "lot-2",
  animals: [{ earTag: "BR-003", outcome: "done", previousLotId: "lot-1" }],
});
const health = makeManejoSession({
  id: "s-health",
  name: "Aftosa",
  date: "2026-09-05",
  status: "closed",
  kind: "health",
  treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0, responsible: "Zé", costBrl: 2 },
  animals: [
    { earTag: "BR-001", outcome: "done" },
    { earTag: "BR-003", outcome: "done" },
  ],
});
const sessions = [sale, transfer, health];

describe("manejoExportTable", () => {
  it("writes one row per session, newest first, with lote, price and status", () => {
    const table = manejoExportTable(sessions, lots);
    expect(table.columns.map((c) => c.header)).toEqual([
      "Data",
      "Tipo",
      "Manejo",
      "Lote",
      "Animais",
      "Responsável",
      "Comprador/vendedor",
      "R$/@",
      "Custo / valor (R$)",
      "Status",
    ]);
    expect(table.rows).toEqual([
      ["2026-09-12", "Troca de lote", "Troca para engorda", "Engorda", 1, null, null, null, null, "Em andamento"],
      ["2026-09-10", "Venda", "Venda frigorífico", null, 1, null, "Frigorífico Boi Bom", 300, 5400, "Concluído"],
      ["2026-09-05", "Vacina", "Aftosa", null, 2, "Zé", null, null, 4, "Concluído"],
    ]);
  });
});

describe("manejoHistoryExportTable", () => {
  it("follows the history rows, the calendar's included", () => {
    const treatments = [
      makeTreatment({ id: "t9", date: "2026-09-01", status: "done", name: "Ivermectina", type: "deworming", costBrl: 1.5 }),
    ];
    const rows = manejoHistory(treatments, [], sessions).filter((row) => row.kind !== "transfer");
    const table = manejoHistoryExportTable(rows, sessions, lots);
    expect(table.rows.map((row) => [row[0], row[1], row[2], row[4], row[8]])).toEqual([
      ["2026-09-10", "Venda", "Venda frigorífico", 1, 5400],
      ["2026-09-05", "Vacina", "Aftosa", 2, 4],
      ["2026-09-01", "Vermifugação", "Ivermectina (Calendário sanitário)", 1, 1.5],
    ]);
  });
});

describe("detail lines", () => {
  const animals = [
    makeAnimal({ earTag: "BR-001", category: "steer", breed: "Nelore", lotId: "lot-2" }),
    makeAnimal({
      earTag: "BR-004",
      lotId: "lot-1",
      weighings: [{ date: "2026-08-01", weightKg: 300 }],
    }),
  ];
  const names = {
    animals,
    lotNames: new Map(lots.map((lot) => [lot.id, lot.name])),
    customCategories: [],
  };

  it("lists a venda's saleRows with carcass arrobas, value and the skipped note", () => {
    const table = saleLinesExportTable("Venda frigorífico", saleRows(sale), names);
    expect(table.rows).toEqual([
      ["BR-001", "Boi", "Nelore", 540, 18, 5400, null],
      ["BR-002", null, null, null, null, null, "pulado · manco"],
    ]);
  });

  it("lists a pesagem's weight, previous weighing and gain", () => {
    const weighing = makeManejoSession({
      name: "Pesagem",
      date: "2026-08-31",
      kind: "weighing",
      weighing: true,
      animals: [
        { earTag: "BR-004", outcome: "done", weightKg: 330 },
        { earTag: "BR-001", outcome: "done", weightKg: 500 },
      ],
    });
    const table = weighingLinesExportTable("Pesagem", sessionWeighingLines(weighing, animals), names);
    expect(table.rows).toEqual([
      ["BR-004", "Boi", "Recria", 330, 300, "2026-08-01", 30, 1, null],
      ["BR-001", "Boi", "Engorda", 500, null, null, null, null, "primeira pesagem"],
    ]);
  });
});
