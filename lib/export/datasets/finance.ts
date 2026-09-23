/**
 * The Financeiro as tables: every despesa, and the herd's estimated sale value
 * by categoria at the arroba price of the day.
 */
import type { Category, Expense } from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";

/** The despesas newest first, the order of the Despesas list. */
export function expensesNewestFirst(expenses: readonly Expense[]): Expense[] {
  return [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Every despesa, newest first. */
export function expensesExportTable(expenses: readonly Expense[], title = "Despesas"): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (e) => e.date },
      { header: "Categoria", value: (e) => EXPENSE_CATEGORY_LABEL[e.category] },
      { header: "Descrição", value: (e) => e.notes ?? null },
      { header: "Valor (R$)", kind: "money", value: (e) => e.amountBrl },
    ],
    expensesNewestFirst(expenses)
  );
}

/** One categoria of the "Vendas e faturamento estimado por categoria" card. */
export interface CategorySalesRow {
  category: Category;
  headCount: number;
  averageArrobas: number;
  totalArrobas: number;
  estimatedValue: number;
}

/** "Bezerros", the card's label of a categoria. */
export function pluralCategoryLabel(category: Category): string {
  const plural = pluralCategory(category, 2);
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/** The card's rows and its Total line as a table. */
export function categorySalesExportTable(
  rows: readonly CategorySalesRow[],
  total: Omit<CategorySalesRow, "category">,
  title = "Vendas por categoria"
): ExportTable {
  const items: { label: string; row: Omit<CategorySalesRow, "category"> }[] = [
    ...rows.map((row) => ({ label: pluralCategoryLabel(row.category), row })),
    { label: "Total", row: total },
  ];
  return buildTable(
    title,
    [
      { header: "Categoria", value: (i) => i.label },
      { header: "Cabeças", kind: "number", value: (i) => i.row.headCount },
      { header: "@ média/cab.", kind: "number", decimals: 1, value: (i) => i.row.averageArrobas },
      { header: "@ total", kind: "number", decimals: 1, value: (i) => i.row.totalArrobas },
      { header: "Valor estimado (R$)", kind: "money", value: (i) => i.row.estimatedValue },
    ],
    items
  );
}
