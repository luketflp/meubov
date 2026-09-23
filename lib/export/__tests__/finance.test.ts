import { describe, expect, it } from "vitest";
import { categorySalesExportTable, expensesExportTable } from "@/lib/export/datasets/finance";
import type { Expense } from "@/lib/types";

describe("expensesExportTable", () => {
  it("writes every despesa newest first, value as money", () => {
    const expenses: Expense[] = [
      { id: "e1", date: "2026-01-05", category: "nutrition", amountBrl: 1200.5, notes: "Sal mineral" },
      { id: "e2", date: "2026-08-10", category: "labor", amountBrl: 3000 },
    ];
    const table = expensesExportTable(expenses);
    expect(table.title).toBe("Despesas");
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Data", "date"],
      ["Categoria", undefined],
      ["Descrição", undefined],
      ["Valor (R$)", "money"],
    ]);
    expect(table.rows).toEqual([
      ["2026-08-10", "Mão de obra", null, 3000],
      ["2026-01-05", "Nutrição", "Sal mineral", 1200.5],
    ]);
  });
});

describe("categorySalesExportTable", () => {
  it("writes one row per categoria and the Total line", () => {
    const table = categorySalesExportTable(
      [{ category: "steer", headCount: 2, averageArrobas: 18, totalArrobas: 36, estimatedValue: 11_000 }],
      { headCount: 2, averageArrobas: 18, totalArrobas: 36, estimatedValue: 11_000 }
    );
    expect(table.rows).toEqual([
      ["Bois", 2, 18, 36, 11_000],
      ["Total", 2, 18, 36, 11_000],
    ]);
  });
});
