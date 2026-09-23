/**
 * XLSX writer: one sheet per table plus a "Sobre" sheet saying which farm,
 * when, who and which filters. Dates are real dates and numbers real numbers,
 * so the file sorts and sums in any spreadsheet. The community build of
 * SheetJS writes no styles, so there is no bold or colour; column widths and
 * number formats are kept.
 *
 * `xlsx` is loaded on demand, as the imports already do.
 */
import type { Cell, ExportColumn, ExportContext, ExportTable } from "@/lib/export/table";

const FORMAT: Partial<Record<NonNullable<ExportColumn["kind"]>, string>> = {
  date: "dd/mm/yyyy",
  money: "#,##0.00",
};

function numberFormat(column: ExportColumn): string | undefined {
  if (column.kind === "number") return column.decimals ? `#,##0.${"0".repeat(column.decimals)}` : "#,##0";
  return column.kind ? FORMAT[column.kind] : undefined;
}

const DAY_MS = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * ISO "YYYY-MM-DD" to the spreadsheet's day serial, counted in UTC. SheetJS
 * turns a JS Date into a serial with the machine's offset, which in Brasília
 * lands a few seconds before midnight and shows the day before.
 */
function toSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / DAY_MS;
}

function cellValue(cell: Cell, column: ExportColumn): string | number | null {
  if (cell === null || cell === "") return null;
  if (column.kind === "date" && typeof cell === "string") return toSerial(cell);
  return cell;
}

/** Excel refuses sheet names over 31 characters or holding : \ / ? * [ ]. */
function sheetName(title: string, taken: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Planilha";
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base.slice(0, 27)} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

export async function xlsxBlob(tables: ExportTable[], context: ExportContext): Promise<Blob> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const taken = new Set<string>();

  for (const table of tables) {
    const aoa = [
      table.columns.map((c) => c.header),
      ...table.rows.map((row) => row.map((cell, i) => cellValue(cell, table.columns[i]))),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    table.columns.forEach((column, c) => {
      const format = numberFormat(column);
      if (!format) return;
      for (let r = 1; r <= table.rows.length; r += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.z = format;
      }
    });
    sheet["!cols"] = table.columns.map((column, c) => {
      const longest = Math.max(
        column.header.length,
        ...table.rows.slice(0, 500).map((row) => String(row[c] ?? "").length)
      );
      return { wch: Math.min(Math.max(longest + 2, column.kind === "date" ? 12 : 8), 48) };
    });
    XLSX.utils.book_append_sheet(book, sheet, sheetName(table.title, taken));
  }

  const about = [
    ["Fazenda", context.place ? `${context.farmName} · ${context.place}` : context.farmName],
    ["Gerado em", context.userName ? `${context.generatedAt} por ${context.userName}` : context.generatedAt],
    ["Filtros", context.filters.length > 0 ? context.filters.join(" · ") : "Nenhum"],
    ...tables.map((t) => [t.title, `${t.rows.length} ${t.rows.length === 1 ? "linha" : "linhas"}`]),
  ];
  const aboutSheet = XLSX.utils.aoa_to_sheet(about);
  aboutSheet["!cols"] = [{ wch: 18 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(book, aboutSheet, sheetName("Sobre", taken));

  const bytes = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
