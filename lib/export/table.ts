/**
 * The one shape every export goes through: a titled table of typed columns.
 *
 * Screens and reports build an {@link ExportTable} from the same selectors they
 * draw with, so the file matches what is on screen. The writers (CSV, XLSX,
 * the print sheet) only read this shape. Pure, shared by all of them.
 */
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";

/** A cell value. Dates travel as ISO "YYYY-MM-DD" in a column of kind "date". */
export type Cell = string | number | null;

/**
 * How a column's values are written. "money" is a number in BRL, and is
 * dropped for a member who may not see the Financeiro.
 */
export type ColumnKind = "text" | "number" | "date" | "money";

export interface ExportColumn {
  header: string;
  kind?: ColumnKind;
  /** Decimal places of a number column (money always has 2). */
  decimals?: number;
}

export interface ExportTable {
  /** Name of the list, e.g. "Rebanho"; also the sheet name and the file slug. */
  title: string;
  columns: ExportColumn[];
  rows: Cell[][];
}

/** Who and where a file comes from, written on its "Sobre" sheet and print header. */
export interface ExportContext {
  farmName: string;
  /** "Uberaba - MG", or empty when the farm has no município. */
  place: string;
  /** "22/09/2026 14:32". */
  generatedAt: string;
  userName?: string;
  /** What narrowed the list, in words: "Lote: Matrizes com cria". */
  filters: string[];
}

export interface ColumnSpec<T> extends ExportColumn {
  value: (item: T) => Cell;
}

/** Builds a table from items, one row per item. */
export function buildTable<T>(title: string, columns: ColumnSpec<T>[], items: readonly T[]): ExportTable {
  return {
    title,
    columns: columns.map(({ header, kind, decimals }) => ({ header, kind, decimals })),
    rows: items.map((item) => columns.map((column) => column.value(item))),
  };
}

/** The table without its money columns when money is hidden; the same table otherwise. */
export function withoutMoney(table: ExportTable, seeMoney: boolean): ExportTable {
  if (seeMoney || !table.columns.some((c) => c.kind === "money")) return table;
  const keep = table.columns.map((c) => c.kind !== "money");
  return {
    ...table,
    columns: table.columns.filter((_, i) => keep[i]),
    rows: table.rows.map((row) => row.filter((_, i) => keep[i])),
  };
}

const decimalsOf = (column: ExportColumn): number => (column.kind === "money" ? 2 : (column.decimals ?? 0));

/** A cell as a person reads it (print sheet): "1.234,5", "22/09/2026", "—" for empty. */
export function formatCell(cell: Cell, column: ExportColumn): string {
  if (cell === null || cell === "") return "—";
  if (typeof cell === "number") return formatNumber(cell, decimalsOf(column));
  if (column.kind === "date") return formatDate(cell);
  return cell;
}

/** A cell as a spreadsheet parses it (CSV): no thousands dots, decimal comma. */
export function plainCell(cell: Cell, column: ExportColumn): string {
  if (cell === null) return "";
  if (typeof cell === "number") return cell.toFixed(decimalsOf(column)).replace(".", ",");
  if (column.kind === "date" && cell) return formatDate(cell);
  return cell;
}
