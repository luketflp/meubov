/**
 * CSV the way a Brazilian Excel opens it: semicolons, decimal comma, dd/mm/aaaa.
 * The BOM is added by {@link csvBlob} so accents survive the double-click.
 */
import { plainCell, type ExportTable } from "@/lib/export/table";

const SEPARATOR = ";";

/**
 * Text a spreadsheet would run as a formula ("=HYPERLINK(...)", "+1", "@SUM")
 * gets a leading apostrophe, so a brinco or observação stays text.
 */
function defuse(field: string): string {
  return /^[=+\-@\t\r]/.test(field) ? `'${field}` : field;
}

function quote(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

/** The table as CSV text, header first, CRLF line ends. */
export function toCsv(table: ExportTable): string {
  const header = table.columns.map((c) => quote(c.header)).join(SEPARATOR);
  const lines = table.rows.map((row) =>
    row.map((cell, i) => {
      const text = plainCell(cell, table.columns[i]);
      return quote(typeof cell === "string" ? defuse(text) : text);
    }).join(SEPARATOR)
  );
  return [header, ...lines].join("\r\n");
}

export function csvBlob(table: ExportTable): Blob {
  return new Blob(["﻿", toCsv(table)], { type: "text/csv;charset=utf-8" });
}
